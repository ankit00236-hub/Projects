"""Reproducible claim-fraud experiment; no approval outcome or identifiers as inputs."""
from pathlib import Path
import hashlib
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score, brier_score_loss, confusion_matrix, precision_score, recall_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
FEATURES = ["defect_code", "dealer_id", "repair_cost_inr", "claim_month"]

def load_data(path):
    frame = pd.read_csv(path)
    expected = {"claim_id", "vin_masked", "claim_date", "defect_code", "repair_cost_inr", "approved", "fraud_flag", "dealer_id"}
    if set(frame.columns) != expected or frame.isna().any().any():
        raise ValueError("Unexpected schema or missing claim values")
    if frame.claim_id.duplicated().any() or not frame.fraud_flag.isin([0, 1]).all() or not frame.approved.isin(["Y", "N"]).all():
        raise ValueError("Invalid identifiers or outcomes")
    if not (np.isfinite(frame.repair_cost_inr) & (frame.repair_cost_inr > 0)).all():
        raise ValueError("Repair costs must be finite positive INR amounts")
    frame["claim_month"] = pd.to_datetime(frame.claim_date, format="%Y-%m-%d", errors="raise").dt.month
    return frame

def metrics(y, score):
    prediction = score >= .5
    return {"average_precision": float(average_precision_score(y, score)), "roc_auc": float(roc_auc_score(y, score)), "brier_score": float(brier_score_loss(y, score)), "precision_at_0_5": float(precision_score(y, prediction, zero_division=0)), "recall_at_0_5": float(recall_score(y, prediction, zero_division=0)), "confusion_matrix": confusion_matrix(y, prediction, labels=[0, 1]).tolist()}

def main():
    path = ROOT / "Data/warranty_claims.csv"
    data = load_data(path)
    X, y, groups = data[FEATURES], data.fraud_flag, data.vin_masked
    train, holdout = next(StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=73).split(X, y, groups))
    folds = list(StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=42).split(X.iloc[train], y.iloc[train], groups.iloc[train]))
    preprocess = ColumnTransformer([("categories", OneHotEncoder(handle_unknown="ignore", sparse_output=False), ["defect_code", "dealer_id"]), ("numeric", StandardScaler(), ["repair_cost_inr", "claim_month"])])
    candidates = {"logistic_regression": make_pipeline(clone(preprocess), LogisticRegression(C=.1, max_iter=1000, random_state=42)), "random_forest": make_pipeline(clone(preprocess), RandomForestClassifier(n_estimators=200, min_samples_leaf=10, n_jobs=2, random_state=42))}
    results = {}
    for name, candidate in candidates.items():
        scores = []
        for fit, validation in folds:
            fitted = clone(candidate).fit(X.iloc[train].iloc[fit], y.iloc[train].iloc[fit])
            scores.append(average_precision_score(y.iloc[train].iloc[validation], fitted.predict_proba(X.iloc[train].iloc[validation])[:, 1]))
        results[name] = {"cv_average_precision": float(np.mean(scores)), "cv_fold_average_precision": [float(s) for s in scores]}
    selected = max(results, key=lambda name: results[name]["cv_average_precision"])
    fitted = clone(candidates[selected]).fit(X.iloc[train], y.iloc[train])
    holdout_metrics = metrics(y.iloc[holdout], fitted.predict_proba(X.iloc[holdout])[:, 1])
    dummy = DummyClassifier(strategy="prior").fit(X.iloc[train], y.iloc[train])
    baseline = metrics(y.iloc[holdout], dummy.predict_proba(X.iloc[holdout])[:, 1])
    final = clone(candidates[selected]).fit(X, y)
    output = ROOT / "Data/processed"
    output.mkdir(exist_ok=True)
    joblib.dump(final, output / "claims_fraud_model.joblib", compress=3)
    report = {"dataset": "warranty_claims.csv", "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rows": len(data), "flagged": int(y.sum()), "fraud_rate": float(y.mean()), "features": FEATURES, "excluded_features": {"claim_id": "Identifier", "vin_masked": "Identifier, used only to group evaluation splits", "approved": "Decision outcome; may leak outcomes", "fraud_flag": "Target label"}, "selected_model": selected, "candidates": results, "holdout": holdout_metrics, "baseline_holdout": baseline, "beats_baseline": holdout_metrics["average_precision"] > baseline["average_precision"] and holdout_metrics["brier_score"] < baseline["brier_score"], "training_rows": len(train), "holdout_rows": len(holdout), "training_flagged": int(y.iloc[train].sum()), "holdout_flagged": int(y.iloc[holdout].sum()), "method": "3-fold stratified grouped CV on training data selects highest average precision; separate approximately 20% grouped holdout; masked VINs never cross partitions. Final experimental artifact refit on all 500 rows.", "seed": 73, "status": "experimental_only", "limitations": ["Only 13 fraud-positive records; metrics have high uncertainty.", "Dataset provenance and label verification were not provided.", "Random grouped evaluation does not establish future performance.", "Scores are not calibrated fraud probabilities; manual review is always required.", "Historical approval is descriptive only; no approval prediction is trained.", "Legacy maintenance, credit, auction and appliance datasets have no validated join key or compatible fraud target and are excluded."]}
    (output / "claims_model_evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
