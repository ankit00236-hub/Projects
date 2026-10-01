"""Clean source tables, compare models without group leakage, and gate promotion."""
import json
import shutil
import time
import hashlib
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit, GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from ml.service_features import ServiceFeatures, KEYS

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'Data/processed'
CATEGORIES = ['brand', 'model', 'engine_type', 'region']

def clean_table(filename, categorical):
    frame = pd.read_csv(ROOT / 'Data' / filename)
    frame.columns = frame.columns.str.strip().str.lower()
    for column in categorical:
        frame[column] = frame[column].astype('string').str.strip().str.lower()
    for column in frame.columns.difference(categorical):
        frame[column] = pd.to_numeric(frame[column].astype('string').str.replace(',', '', regex=False).str.strip(), errors='coerce')
    return frame

def scores(y, prediction):
    return {'mae_inr': float(mean_absolute_error(y, prediction)), 'rmse_inr': float(np.sqrt(mean_squared_error(y, prediction))), 'r2': float(r2_score(y, prediction))}

def main():
    raw = clean_table('Vehicle Maintenance- Service Records.csv', CATEGORIES + ['vehicle_type'])
    incumbent = joblib.load(OUTPUT / 'service_cost_model.pkl')
    features = incumbent.feature_names_in_.tolist()
    raw_count = len(raw)
    raw = raw.dropna(subset=features + ['cost'])
    flags = [c for c in features if c not in CATEGORIES + ['make_year', 'mileage', 'mileage_range']]
    valid = (raw.cost > 0) & (raw.mileage >= 0) & (raw.mileage_range > 0) & raw[flags].isin([0, 1]).all(axis=1)
    raw = raw.loc[valid].drop_duplicates(subset=features + ['cost']).reset_index(drop=True)
    mandatory = pd.read_csv(ROOT / 'Data/Vehicle Maintenance- vGeneral Mandatory Service.csv')
    for key in KEYS:
        mandatory[key] = mandatory[key].str.strip().str.lower()
    price = clean_table('Vehicle Maintenance- Standard Components Cost.csv', KEYS + ['vehicle_type'])
    schedule_fields = ['cost' + str(n) + 'k' for n in range(10, 81, 10)]
    for field in schedule_fields + ['labour_cost']:
        mandatory[field] = pd.to_numeric(mandatory[field], errors='coerce')
    reference_frame = mandatory[KEYS + schedule_fields + ['labour_cost']].merge(price[KEYS + ['clutch_plate', 'barke_pad', 'radiator', 'battery']], on=KEYS, validate='one_to_one')
    reference = {tuple(row[k] for k in KEYS): {k: float(row[k]) for k in row.index if k not in KEYS} for _, row in reference_frame.iterrows()}
    mandatory.to_csv(OUTPUT / 'mandatory_service_clean.csv', index=False)
    price.to_csv(OUTPUT / 'component_cost_clean.csv', index=False)
    X, y = raw[features], raw.cost
    # Similar records differing only in actual mileage stay in the same partition.
    groups = pd.util.hash_pandas_object(X.drop(columns='mileage'), index=False).to_numpy()
    train, test = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=73).split(X, y, groups))
    folds = list(GroupKFold(n_splits=3).split(X.iloc[train], y.iloc[train], groups[train]))
    numeric = [c for c in features if c not in CATEGORIES]
    def candidate(estimator, enriched):
        engineering = ServiceFeatures(reference if enriched else None)
        extra = engineering.fit(X).transform(X).columns.difference(features).tolist()
        preprocessing = ColumnTransformer([('categories', OneHotEncoder(handle_unknown='ignore', sparse_output=False), CATEGORIES), ('numbers', SimpleImputer(strategy='median'), numeric + extra)])
        return Pipeline([('features', engineering), ('preprocessor', preprocessing), ('model', estimator)])
    baseline = clone(incumbent)
    # If retraining an already enriched model, compare its exact configuration too.
    candidates = {'baseline': baseline}
    for enriched in [False, True]:
        suffix = '_references' if enriched else '_engineered'
        candidates['extra_trees' + suffix] = candidate(ExtraTreesRegressor(n_estimators=200, min_samples_leaf=2, max_features=1.0, n_jobs=2, random_state=42), enriched)
        candidates['hist_gradient' + suffix] = candidate(HistGradientBoostingRegressor(max_iter=200, max_leaf_nodes=15, l2_regularization=10, learning_rate=0.07, random_state=42), enriched)
    results = {}
    for name, pipeline in candidates.items():
        start = time.perf_counter()
        fold_metrics = []
        for fit_indices, validation in folds:
            fitted = clone(pipeline).fit(X.iloc[train].iloc[fit_indices], y.iloc[train].iloc[fit_indices])
            fold_metrics.append(scores(y.iloc[train].iloc[validation], fitted.predict(X.iloc[train].iloc[validation])))
        results[name] = {'cv': {k: float(np.mean([m[k] for m in fold_metrics])) for k in fold_metrics[0]}, 'fit_seconds': round(time.perf_counter() - start, 3)}
        print(name, results[name], flush=True)
    chosen = min(results, key=lambda name: results[name]['cv']['mae_inr'])
    # Candidate choice is finalized before examining the separate holdout.
    for name in set(['baseline', chosen]):
        fitted = clone(candidates[name]).fit(X.iloc[train], y.iloc[train])
        results[name]['holdout'] = scores(y.iloc[test], fitted.predict(X.iloc[test]))
    promoted = chosen != 'baseline' and results[chosen]['holdout']['mae_inr'] < results['baseline']['holdout']['mae_inr'] * 0.98
    report = {'rows_raw': raw_count, 'rows_clean': len(raw), 'group_count': len(set(groups)), 'training_rows': len(train), 'holdout_rows': len(test), 'seed': 73, 'selection': '3-fold grouped CV on training only; separate 20% grouped holdout; promotion requires >2% holdout MAE improvement', 'results': results, 'selected_candidate': chosen, 'promoted': promoted, 'sources': {'service_records': 'Existing labels; raw records equal previous cleaned records.', 'component_costs': 'Cleaned comma-separated numeric prices; joined by brand/model/engine.', 'mandatory_service': 'Known scheduled costs and labour rates; no service-record target averages.', 'excluded': ['car_prices.csv: auction sale prices; incompatible target/currency and geography', 'Safercar_data.csv: safety specifications; no service-cost labels', 'credit_score_data.csv: credit scores; separate target', 'train.csv and test_1.csv: appliance warranty fraud; not automotive maintenance', 'sample_submission.csv: placeholder predictions, not labels']}}
    report['data_sha256'] = hashlib.sha256((ROOT / 'Data/Vehicle Maintenance- Service Records.csv').read_bytes()).hexdigest()
    final = clone(candidates[chosen]).fit(X, y)
    candidate_path = OUTPUT / 'service_cost_model.candidate.pkl'
    joblib.dump(final, candidate_path)
    assert np.isfinite(joblib.load(candidate_path).predict(X.iloc[:3])).all()
    report['candidate_artifact'] = candidate_path.name
    if promoted:
        backup = OUTPUT / 'service_cost_model.previous.pkl'
        if not backup.exists(): shutil.copy2(OUTPUT / 'service_cost_model.pkl', backup)
        temporary = OUTPUT / 'service_cost_model.pending.pkl'
        joblib.dump(final, temporary)
        # Verify serialization and inference before replacing the active artifact.
        assert np.isfinite(joblib.load(temporary).predict(X.iloc[:3])).all()
        temporary.replace(OUTPUT / 'service_cost_model.pkl')
        raw.to_csv(OUTPUT / 'service_records_clean.csv', index=False)
    (OUTPUT / 'service_model_evaluation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'selected': chosen, 'promoted': promoted, 'comparison': {n: r.get('holdout') for n, r in results.items() if 'holdout' in r}}, indent=2), flush=True)

if __name__ == '__main__': main()
