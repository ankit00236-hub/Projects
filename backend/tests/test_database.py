import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.database import router, connection


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"DATABASE_URL": "", "POSTGRES_URL": "", "VERCEL": "", "PLUTUS_SQLITE_PATH": self.directory.name + "/test.db"})
        self.env.start()
        app = FastAPI()
        app.include_router(router, prefix="/api")
        self.a, self.b = TestClient(app), TestClient(app)
        self.headers = {"X-Plutus-Request": "1"}
        self.credentials = {"username": "alice", "password": "a-strong-password-123"}
        self.assertEqual(self.a.post("/api/auth/register", json=self.credentials, headers=self.headers).status_code, 200)

    def tearDown(self):
        self.env.stop()
        self.directory.cleanup()

    def put(self, records, revision=0, client=None):
        return (client or self.a).put("/api/records/notes", json={"records": records, "revision": revision}, headers=self.headers)

    def test_persistence_login_logout_and_private_accounts(self):
        note = {"id": "n1", "text": "Request invoice", "done": False, "category": "Warranty", "due": ""}
        self.assertEqual(self.put([note]).status_code, 200)
        self.assertEqual(self.b.get("/api/records/notes").status_code, 401)
        self.assertEqual(self.b.post("/api/auth/register", json={**self.credentials, "username": "bob"}, headers=self.headers).status_code, 200)
        self.assertEqual(self.b.get("/api/records/notes").json()["records"], [])
        self.assertEqual(self.a.post("/api/auth/logout", headers=self.headers).status_code, 200)
        self.assertEqual(self.a.get("/api/records/notes").status_code, 401)
        self.assertEqual(self.a.post("/api/auth/login", json=self.credentials, headers=self.headers).status_code, 200)
        self.assertEqual(self.a.get("/api/records/notes").json()["records"], [note])
        self.assertEqual(self.a.get("/api/records/notes").headers["cache-control"], "no-store")

    def test_conflicting_save_does_not_overwrite(self):
        first = [{"id": "n1", "text": "First", "done": False, "category": "General"}]
        self.assertEqual(self.put(first).json()["revision"], 1)
        self.assertEqual(self.put([]).status_code, 409)
        self.assertEqual(self.a.get("/api/records/notes").json()["records"], first)
        self.assertEqual(self.put([], revision=1).status_code, 200)

    def test_validation_and_csrf(self):
        self.assertEqual(self.put([{"id": "n1"}]).status_code, 422)
        self.assertEqual(self.a.put("/api/records/notes", json={"records": [], "revision": 0}).status_code, 403)
        self.assertEqual(self.a.put("/api/records/notes", json={"records": [], "revision": 0}, headers={**self.headers, "Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.a.get("/api/records/unknown").status_code, 404)

    def test_duplicate_and_bad_password(self):
        self.assertEqual(self.b.post("/api/auth/register", json=self.credentials, headers=self.headers).status_code, 409)
        self.assertEqual(self.b.post("/api/auth/login", json={**self.credentials, "password": "wrong-password-123"}, headers=self.headers).status_code, 401)
        with connection() as db:
            saved = db.execute("SELECT password FROM app_users").fetchone()[0]
        self.assertNotIn(self.credentials["password"], saved)

    def test_expired_session(self):
        with connection() as db:
            db.execute("UPDATE app_sessions SET expires=0")
        self.assertEqual(self.a.get("/api/auth/me").status_code, 401)

    def test_claim_cannot_link_unknown_vehicle(self):
        claim = {"id": "c1", "vehicle": "Honda Jazz", "owner": "Alice", "claim": "Clutch", "status": "Pending", "amount": 1000, "assetId": "missing"}
        response = self.a.put("/api/records/cases", json={"records": [claim], "revision": 0}, headers=self.headers)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.a.get("/api/records/cases").json()["records"], [])

    def test_vehicle_registration_financing_and_new_claim_model_fields(self):
        asset = {"id": "vehicle-new", "owner": "Alice", "registration": "TEST-NEW", "service": {"brand": "Maruti", "model": "Swift", "engine_type": "petrol", "region": "Delhi", "make_year": 2024, "mileage": 12000, "mileage_range": 10000}, "loan": {"price": 800000, "down": 160000, "rate": 9, "months": 60}, "monthlyIncome": 80000, "existingEmi": 1000, "overdueAmount": 2500, "policy": {"start": "2024-01-01", "end": "2028-12-31", "maxMileage": 100000, "claimLimit": 500000, "components": ["brake_pads", "battery"]}}
        response = self.a.put("/api/records/assets", json={"records": [asset], "revision": 0}, headers={**self.headers, "Origin": "http://127.0.0.1:5174"})
        self.assertEqual(response.status_code, 200, response.text)
        case = {"id": "claim-new", "assetId": asset["id"], "vehicle": "Maruti Swift", "owner": "Alice", "claim": "Brake pads", "claimKey": "brake_pads", "amount": 44657, "mileage": 12000, "claimDate": "2024-11-17", "defect_code": "Brake_Pad", "dealer_id": "DLR01", "status": "Pending"}
        saved = self.a.put("/api/records/cases", json={"records": [case], "revision": 0}, headers=self.headers)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(self.a.get("/api/records/cases").json()["records"][0]["assetId"], asset["id"])
        self.assertEqual(self.a.get("/api/records/cases").json()["records"][0]["defect_code"], "Brake_Pad")
        asset["overdueAmount"] = 0
        self.assertEqual(self.a.put("/api/records/assets", json={"records": [asset], "revision": 1}, headers=self.headers).status_code, 200)
        self.assertEqual(self.a.get("/api/records/cases").json()["records"][0]["status"], "Pending")

    def test_demo_data_is_linked_varied_and_requires_authentication(self):
        self.assertEqual(self.b.post('/api/demo-data', headers=self.headers).status_code, 401)
        self.assertEqual(self.a.post('/api/demo-data').status_code, 403)
        response = self.a.post('/api/demo-data', headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['added'], {'assets': 6, 'cases': 10, 'notes': 6})
        assets = self.a.get('/api/records/assets').json()['records']
        cases = self.a.get('/api/records/cases').json()['records']
        notes = self.a.get('/api/records/notes').json()['records']
        self.assertTrue(all(c['assetId'] in {a['id'] for a in assets} for c in cases))
        self.assertEqual({c['status'] for c in cases}, {'Pending', 'Review', 'Approved', 'Rejected'})
        self.assertEqual({n['category'] for n in notes}, {'Warranty', 'Financing', 'Dealer', 'General'})
        self.assertEqual(len({c['defect_code'] for c in cases if c['defect_code']}), 5)
        self.assertTrue(all(r['demo'] and r['source'] == 'synthetic_demo' for r in assets + cases + notes))
        self.assertTrue(any(a['overdueAmount'] > 0 for a in assets))
        self.assertTrue(any(a['loan']['rate'] == 0 for a in assets))

    def test_demo_reload_preserves_real_and_edited_records_without_duplicates(self):
        note = {'id': 'real-note', 'text': 'Keep my existing note', 'done': False, 'category': 'General'}
        self.assertEqual(self.put([note]).status_code, 200)
        self.assertEqual(self.a.post('/api/demo-data', headers=self.headers).status_code, 200)
        current = self.a.get('/api/records/cases').json()
        current['records'][0]['status'] = 'Rejected'
        self.assertEqual(self.a.put('/api/records/cases', json=current, headers=self.headers).status_code, 200)
        before = {name: self.a.get('/api/records/' + name).json() for name in ('assets', 'cases', 'notes')}
        second = self.a.post('/api/demo-data', headers=self.headers)
        self.assertEqual(second.json()['added'], {'assets': 0, 'cases': 0, 'notes': 0})
        after = {name: self.a.get('/api/records/' + name).json() for name in ('assets', 'cases', 'notes')}
        self.assertEqual(before, after)
        self.assertEqual(after['cases']['records'][0]['status'], 'Rejected')
        self.assertIn(note, after['notes']['records'])

    def test_rate_limit(self):
        for _ in range(15):
            result = self.b.post("/api/auth/login", json={**self.credentials, "password": "wrong-password-123"}, headers=self.headers)
        self.assertEqual(result.status_code, 429)


if __name__ == "__main__":
    unittest.main()
