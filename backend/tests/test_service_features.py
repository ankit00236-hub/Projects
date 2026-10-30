"""Replacement of obsolete service-model tests with claim training checks."""
import hashlib
import json
import unittest
from pathlib import Path
import joblib
import numpy as np
from backend.claim_model import ClaimModel
from sklearn.model_selection import StratifiedGroupKFold
from ml.train_claims_model import FEATURES, load_data

ROOT = Path(__file__).resolve().parents[2]

class ClaimTrainingTests(unittest.TestCase):
    def test_artifact_and_report_match_source(self):
        source = ROOT / 'Data/warranty_claims.csv'
        data = load_data(source)
        report = json.loads((ROOT / 'Data/processed/claims_model_evaluation.json').read_text())
        self.assertEqual(report['sha256'], hashlib.sha256(source.read_bytes()).hexdigest())
        self.assertEqual(report['rows'], len(data))
        self.assertEqual(report['flagged'], int(data.fraud_flag.sum()))
        model = joblib.load(ROOT / 'Data/processed/claims_fraud_model.joblib')
        self.assertEqual(model.feature_names_in_.tolist(), FEATURES)
        self.assertTrue(set(FEATURES).isdisjoint({'claim_id', 'approved', 'fraud_flag', 'vin_masked'}))
        self.assertEqual(model.predict_proba(data[FEATURES].head()).shape, (5, 2))

    def test_small_runtime_matches_pipeline_on_source_and_new_claims(self):
        frame = load_data(ROOT / 'Data/warranty_claims.csv')[FEATURES]
        new = frame.iloc[:10].copy()
        new['repair_cost_inr'] = [0.01, 1, 1000, 9999, 100000, 499465, 500000, 1000000, 1000000000, 261973]
        new['claim_month'] = [1, 12, 6, 7, 8, 3, 4, 11, 2, 10]
        import pandas as pd
        samples = pd.concat([frame, new], ignore_index=True)
        pipeline = joblib.load(ROOT / 'Data/processed/claims_fraud_model.joblib')
        scorer = ClaimModel(ROOT / 'Data/processed/claims_fraud_model.json')
        np.testing.assert_allclose(scorer.predict_proba(samples.to_dict(orient='records')), pipeline.predict_proba(samples), atol=1e-12, rtol=1e-12)

    def test_no_masked_vin_leaks_across_evaluation_partitions(self):
        data = load_data(ROOT / 'Data/warranty_claims.csv')
        train, holdout = next(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=73).split(data[FEATURES], data.fraud_flag, data.vin_masked))
        self.assertFalse(set(data.vin_masked.iloc[train]) & set(data.vin_masked.iloc[holdout]))
        self.assertGreater(data.fraud_flag.iloc[holdout].sum(), 0)
        for fit, validation in StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=42).split(data.iloc[train], data.fraud_flag.iloc[train], data.vin_masked.iloc[train]):
            self.assertFalse(set(data.vin_masked.iloc[train].iloc[fit]) & set(data.vin_masked.iloc[train].iloc[validation]))
            self.assertGreater(data.fraud_flag.iloc[train].iloc[validation].sum(), 0)
