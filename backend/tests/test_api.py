import json
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app

class PredictionTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.payload = json.loads((Path(__file__).resolve().parents[2] / 'src/data/trainingData.json').read_text())['initialForm']

    def test_real_model(self):
        response = self.client.post('/predict-service-cost', json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertGreater(response.json()['predicted_service_cost'], 0)

    def test_invalid_inputs(self):
        for update in ({'mileage': -1}, {'brand': 'ford'}, {'mileage_range': 12345}, {'clutch': 2}, {'clutch': 0.5}, {'extra': 1}, {'model': 'fortuner'}):
            with self.subTest(update=update):
                self.assertEqual(self.client.post('/predict-service-cost', json={**self.payload, **update}).status_code, 422)

    def test_normalized_categories(self):
        response = self.client.post('/predict-service-cost', json={**self.payload, 'brand': ' HONDA '})
        self.assertEqual(response.status_code, 200)

    def test_invalid_model_output(self):
        with patch('backend.main.model.predict', return_value=[float('nan')]):
            self.assertEqual(self.client.post('/predict-service-cost', json=self.payload).status_code, 503)

    def test_health(self):
        self.assertEqual(self.client.get('/health').json()['status'], 'ready')

if __name__ == '__main__':
    unittest.main()
