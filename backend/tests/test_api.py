import unittest
import numpy as np
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app

class ClaimApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.payload = dict(claim_date='2024-11-17', defect_code='Electrical_Short', repair_cost_inr=44657.0, dealer_id='DLR02')

    def test_real_screening_and_no_automatic_decision(self):
        response = self.client.post('/screen-claim', json=self.payload)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertTrue(0 <= result['model_score'] <= 1)
        self.assertTrue(result['experimental'])
        self.assertEqual(result['review'], 'Manual review required')
        self.assertNotIn('approved', result)
        self.assertGreater(result['comparison']['records'], 0)

    def test_invalid_and_leaking_inputs(self):
        for update in ({'repair_cost_inr': -1}, {'repair_cost_inr': 0}, {'repair_cost_inr': True}, {'repair_cost_inr': 'NaN'}, {'dealer_id': 'unknown'}, {'defect_code': 'unknown'}, {'claim_date': '2024-02-30'}, {'claim_date': 'not-a-date'}, {'approved': 'Y'}, {'fraud_flag': 1}, {'vin_masked': 'XXXX89901'}):
            with self.subTest(update=update):
                self.assertEqual(self.client.post('/screen-claim', json={**self.payload, **update}).status_code, 422)

    def test_invalid_output_and_inference_failure(self):
        for output in (float('nan'), float('inf'), -1, 2):
            with patch('backend.main.model.predict_proba', return_value=np.array([[0, output]])):
                self.assertEqual(self.client.post('/screen-claim', json=self.payload).status_code, 503)
        with patch('backend.main.model.predict_proba', side_effect=RuntimeError('test failure')):
            self.assertEqual(self.client.post('/screen-claim', json=self.payload).status_code, 503)

    def test_health_and_removed_endpoints(self):
        self.assertEqual(self.client.get('/health').json()['dataset_rows'], 500)
        for endpoint in ('predict-service-cost', 'assess-warranty'):
            self.assertEqual(self.client.post('/' + endpoint, json={}).status_code, 404)

    def test_dataset_reconciles(self):
        response = self.client.get('/claims-data')
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(len(result['records']), result['summary']['records'])
        self.assertEqual(sum(r['fraud_flag'] for r in result['records']), 13)
        self.assertEqual(sum(r['approved'] == 'Y' for r in result['records']), result['summary']['approved'])
