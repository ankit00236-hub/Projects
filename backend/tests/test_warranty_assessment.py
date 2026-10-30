"""Claim screening must disclose unsupported extrapolation and model limitations."""
import unittest
from fastapi.testclient import TestClient
from backend.main import app

class ScreeningLimitsTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.payload = dict(claim_date='2024-11-17', defect_code='Electrical_Short', repair_cost_inr=44657.0, dealer_id='DLR02')

    def test_future_and_out_of_range_cost_warnings(self):
        result = self.client.post('/screen-claim', json={**self.payload, 'claim_date': '2026-10-30', 'repair_cost_inr': 900000.0}).json()
        self.assertTrue(any('outside the dataset period' in w for w in result['warnings']))
        self.assertTrue(any('outside the observed training range' in w for w in result['warnings']))

    def test_model_cannot_clear_a_claim(self):
        result = self.client.post('/screen-claim', json=self.payload).json()
        self.assertEqual(result['review'], 'Manual review required')
        self.assertTrue(any('not a calibrated' in w for w in result['warnings']))
        self.assertTrue(any('failed to beat' in w for w in result['warnings']))
        self.assertIn('not an explanation', result['comparison']['scope'])
