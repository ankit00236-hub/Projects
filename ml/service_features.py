"""Serializable service features; reference tables are embedded in the fitted model."""
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

KEYS = ['brand', 'model', 'engine_type']

class ServiceFeatures(TransformerMixin, BaseEstimator):
    def __init__(self, reference=None):
        self.reference = reference

    def fit(self, X, y=None):
        self.feature_names_in_ = np.asarray(X.columns, dtype=object)
        self.n_features_in_ = len(X.columns)
        return self

    def transform(self, X):
        result = X.copy()
        flags = [c for c in X if c not in ['brand', 'model', 'engine_type', 'region', 'make_year', 'mileage', 'mileage_range']]
        result['service_count'] = X[flags].sum(axis=1)
        result['interval_deviation'] = X['mileage'] - X['mileage_range']
        if self.reference is not None:
            refs = [self.reference.get(tuple(row), {}) for row in X[KEYS].itertuples(index=False, name=None)]
            for field in ['labour_cost', 'clutch_plate', 'barke_pad', 'radiator', 'battery']:
                result['reference_' + field] = [r.get(field, np.nan) for r in refs]
            result['scheduled_cost'] = [r.get('cost' + str(min(80, max(10, int(interval) // 10000 * 10))) + 'k', np.nan) for r, interval in zip(refs, X.mileage_range)]
            result['clutch_reference'] = result['reference_clutch_plate'] * X.clutch
            result['brake_reference'] = result['reference_barke_pad'] * X.brake_pads
        return result
