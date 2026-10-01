import json
import unittest
from pathlib import Path
import joblib
import pandas as pd
from sklearn.base import clone
from ml.service_features import ServiceFeatures

ROOT = Path(__file__).resolve().parents[2]

class ServiceFeaturesTests(unittest.TestCase):
    def setUp(self):
        self.frame = pd.DataFrame([json.loads((ROOT / 'src/data/trainingData.json').read_text())['initialForm']])

    def test_reference_features_and_no_input_mutation(self):
        original = self.frame.copy(deep=True)
        reference = {('honda', 'jazz', 'petrol'): {'cost10k': 2010, 'labour_cost': 690, 'clutch_plate': 2640, 'barke_pad': 2849}}
        features = clone(ServiceFeatures(reference)).fit_transform(self.frame)
        self.assertEqual(features['scheduled_cost'].iloc[0], 2010)
        self.assertEqual(features['interval_deviation'].iloc[0], 1400)
        pd.testing.assert_frame_equal(original, self.frame)
        self.assertNotIn('cost', features)

    def test_clean_price_parsing(self):
        table = pd.read_csv(ROOT / 'Data/processed/component_cost_clean.csv')
        value = table.loc[table.model == 'fortuner', 'front_windsheild'].iloc[0]
        self.assertEqual(value, 161993)

    def test_candidate_serialization(self):
        pipeline = joblib.load(ROOT / 'Data/processed/service_cost_model.candidate.pkl')
        self.assertGreater(float(pipeline.predict(self.frame)[0]), 0)

if __name__ == '__main__': unittest.main()
