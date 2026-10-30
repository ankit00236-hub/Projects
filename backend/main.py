"""Warranty claim screening API. Historical decisions are never model inputs."""
from pathlib import Path
from threading import Lock
import json
import logging
import math

import csv
from datetime import date
from statistics import median
from backend.claim_model import ClaimModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from backend.database import router as database_router

ROOT = Path(__file__).resolve().parents[1]
app = FastAPI()
app.include_router(database_router)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://localhost:5174"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
logger = logging.getLogger(__name__)
lock = Lock()
with (ROOT / "Data/warranty_claims.csv").open() as source:
    records = [{**row, "repair_cost_inr": float(row["repair_cost_inr"]), "fraud_flag": int(row["fraud_flag"])} for row in csv.DictReader(source)]
costs = [row["repair_cost_inr"] for row in records]
start, end = min(row["claim_date"] for row in records), max(row["claim_date"] for row in records)
report = json.loads((ROOT / "Data/processed/claims_model_evaluation.json").read_text())
model = ClaimModel(ROOT / "Data/processed/claims_fraud_model.json")
defects = sorted({row["defect_code"] for row in records})
dealers = sorted({row["dealer_id"] for row in records})

class ClaimInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    claim_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    defect_code: str
    repair_cost_inr: float = Field(gt=0, le=1_000_000_000, allow_inf_nan=False, strict=True)
    dealer_id: str

@app.get("/")
def home():
    return {"message": "Plutus claim screening API"}

@app.get("/health")
def health():
    return {"status": "ready", "model": report["selected_model"], "dataset_rows": len(records), "decision_use": "exploratory_only"}

@app.get("/claims-data")
def claims_data():
    return {"records": records, "defects": defects, "dealers": dealers, "evaluation": report, "summary": {"records": len(records), "flagged": sum(row["fraud_flag"] for row in records), "approved": sum(row["approved"] == "Y" for row in records), "total_cost_inr": sum(costs), "median_cost_inr": median(costs), "start": start, "end": end}}

@app.post("/screen-claim")
def screen_claim(data: ClaimInput):
    try:
        claim_date = date.fromisoformat(data.claim_date)
    except ValueError as error:
        raise HTTPException(422, "Enter a valid claim date.") from error
    if data.defect_code not in defects or data.dealer_id not in dealers:
        raise HTTPException(422, "Choose a defect and dealer present in the dataset.")
    frame = [{"defect_code": data.defect_code, "dealer_id": data.dealer_id, "repair_cost_inr": data.repair_cost_inr, "claim_month": claim_date.month}]
    try:
        with lock:
            score = float(model.predict_proba(frame)[0][1])
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("Invalid score")
    except Exception as error:
        logger.exception("Claim screening failed")
        raise HTTPException(503, "Claim screening is temporarily unavailable.") from error
    comparable = [row["repair_cost_inr"] for row in records if row["defect_code"] == data.defect_code]
    warnings = ["Only 13 flagged examples are available; the score is experimental and is not a calibrated fraud probability.", "Manual review determines fraud and claim approval. A low score does not establish that a claim is legitimate."]
    if not report["beats_baseline"]:
        warnings.insert(0, "The candidate failed to beat the baseline on the separate holdout. This model is not validated for claim decisions.")
    if data.claim_date < start or data.claim_date > end:
        warnings.append("This date is outside the dataset period; performance on future claims has not been established.")
    if data.repair_cost_inr < min(costs) or data.repair_cost_inr > max(costs):
        warnings.append("The repair cost is outside the observed training range.")
    return {"model_score": round(score, 6), "baseline_rate": report["fraud_rate"], "review": "Manual review required", "model": report["selected_model"], "experimental": True, "warnings": warnings, "comparison": {"records": len(comparable), "median_cost_inr": median(comparable), "cost_percentile": round(sum(cost <= data.repair_cost_inr for cost in comparable) / len(comparable) * 100, 1), "scope": "Historical cost comparison only; not an explanation of the fraud score."}}
