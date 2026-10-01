from pathlib import Path

import csv
import json
import logging
import math
from threading import Lock
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
import pandas as pd
import joblib


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://localhost:5174",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the trained ML model
MODEL_PATH = Path(__file__).resolve().parents[1] / "Data" / "processed" / "service_cost_model.pkl"
model = joblib.load(MODEL_PATH)
PREDICTION_LOCK = Lock()
logger = logging.getLogger(__name__)
with (MODEL_PATH.parent / "service_records_clean.csv").open() as source:
    training_records = list(csv.DictReader(source))
VEHICLE_FIELDS = ("brand", "model", "engine_type", "make_year", "region")
SUPPORTED_VEHICLES = {tuple(row[key] for key in VEHICLE_FIELDS) for row in training_records}
SUPPORTED_INTERVALS = {int(row["mileage_range"]) for row in training_records}
TRAINING_SUPPORT = {}
for record in training_records:
    support_key = tuple(record[key] for key in VEHICLE_FIELDS) + (record["mileage_range"],)
    observed_mileage = float(record["mileage"])
    support = TRAINING_SUPPORT.setdefault(support_key, {
        "matching_records": 0, "minimum_mileage": observed_mileage, "maximum_mileage": observed_mileage,
    })
    support["matching_records"] += 1
    support["minimum_mileage"] = min(support["minimum_mileage"], observed_mileage)
    support["maximum_mileage"] = max(support["maximum_mileage"], observed_mileage)
REFERENCE_KEYS = ("brand", "model", "engine_type")
MAX_AMOUNT_DEVIATION = 0.25
SERVICE_FLAGS = (
    "washer_plug_drain", "dust_and_pollen_filter", "whell_alignment_and_balancing",
    "air_clean_filter", "fuel_filter", "spark_plug", "brake_fluid",
    "brake_and_clutch_oil", "transmission_fluid", "brake_pads", "clutch", "coolant",
)
COMPONENT_MAPPING = {
    "clutch": ("clutch_plate", "Clutch plate"),
    "brake_pads": ("barke_pad", "Brake pads"),
}


def load_reference_table(filename):
    """Reference prices are optional; missing prices must not become zero costs."""
    try:
        with (MODEL_PATH.parent / filename).open() as source:
            return {
                tuple(row[key].strip().lower() for key in REFERENCE_KEYS): row
                for row in csv.DictReader(source)
            }
    except OSError:
        logger.warning("Cost reference table is unavailable: %s", filename)
        return {}


COMPONENT_REFERENCES = load_reference_table("component_cost_clean.csv")
SCHEDULED_REFERENCES = load_reference_table("mandatory_service_clean.csv")
try:
    MODEL_EVALUATION = json.loads((MODEL_PATH.parent / "service_model_evaluation.json").read_text())
except (OSError, ValueError):
    MODEL_EVALUATION = {}


def model_validation_summary():
    """These are configuration evaluation results, not per-claim confidence scores."""
    results = MODEL_EVALUATION.get("results", {})
    baseline = results.get("baseline", {}).get("holdout", {})
    candidate = results.get(MODEL_EVALUATION.get("selected_candidate"), {}).get("holdout", {})
    return {
        "service_records": len(training_records),
        "holdout_records": MODEL_EVALUATION.get("holdout_rows"),
        "baseline_holdout_mae_inr": round(baseline["mae_inr"], 2) if "mae_inr" in baseline else None,
        "candidate_holdout_mae_inr": round(candidate["mae_inr"], 2) if "mae_inr" in candidate else None,
        "candidate_promoted": MODEL_EVALUATION.get("promoted", False),
        "method": MODEL_EVALUATION.get("selection"),
        "scope": "Service-cost configuration evaluation; not a warranty-coverage or credit-risk model.",
    }


class ServicePredictionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    brand: str
    model: str
    engine_type: str
    make_year: int = Field(strict=True)
    region: str
    mileage_range: int = Field(strict=True)
    mileage: float = Field(ge=0, allow_inf_nan=False)
    washer_plug_drain: int = Field(ge=0, le=1, strict=True)
    dust_and_pollen_filter: int = Field(ge=0, le=1, strict=True)
    whell_alignment_and_balancing: int = Field(ge=0, le=1, strict=True)
    air_clean_filter: int = Field(ge=0, le=1, strict=True)
    fuel_filter: int = Field(ge=0, le=1, strict=True)
    spark_plug: int = Field(ge=0, le=1, strict=True)
    brake_fluid: int = Field(ge=0, le=1, strict=True)
    brake_and_clutch_oil: int = Field(ge=0, le=1, strict=True)
    transmission_fluid: int = Field(ge=0, le=1, strict=True)
    brake_pads: int = Field(ge=0, le=1, strict=True)
    clutch: int = Field(ge=0, le=1, strict=True)
    coolant: int = Field(ge=0, le=1, strict=True)


class WarrantyAssessmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service: ServicePredictionInput
    requested_amount: float = Field(ge=0.01, le=1_000_000_000_000, strict=True, allow_inf_nan=False)


class ReferenceItem(BaseModel):
    field: str
    label: str
    cost: float
    source: str


class WarrantyAssessmentResult(BaseModel):
    currency: Literal["INR"] = "INR"
    requested_amount: float
    predicted_service_cost: float
    amount_deviation_ratio: float | None
    triage: Literal["review", "within_estimate"]
    reasons: list[str]
    informational_only: Literal[True] = True
    reference_cost: float | None
    scheduled_reference_cost: float | None
    scheduled_reference_interval_km: int | None
    reference_items: list[ReferenceItem]
    unmapped_selected_components: list[str]
    reference_provenance: dict
    training_support: dict
    model_validation: dict
    policy: dict
    limitations: list[str]


@app.get("/")
def home():
    return {"message": "Plutus backend is running"}


def normalize_service_input(data: ServicePredictionInput):
    values = data.model_dump()
    for key in ("brand", "model", "engine_type", "region"):
        values[key] = values[key].strip().lower()
    if tuple(str(values[key]) for key in VEHICLE_FIELDS) not in SUPPORTED_VEHICLES:
        raise HTTPException(status_code=422, detail="Choose a vehicle combination supported by the training data.")
    if values["mileage_range"] not in SUPPORTED_INTERVALS:
        raise HTTPException(status_code=422, detail="Choose a service interval present in the training data.")
    return values


def predict_values(values):
    input_data = pd.DataFrame([values])

    try:
        # Bound concurrent model work; the forest itself uses worker threads.
        with PREDICTION_LOCK:
            prediction = float(model.predict(input_data)[0])
        if not math.isfinite(prediction) or prediction < 0:
            raise ValueError("Invalid model prediction")
    except Exception as error:
        logger.exception("Service cost prediction failed")
        raise HTTPException(status_code=503, detail="The estimator is temporarily unavailable. Please try again.") from error

    return round(prediction, 2)


@app.post("/predict-service-cost")
def predict_service_cost(data: ServicePredictionInput):
    return {"predicted_service_cost": predict_values(normalize_service_input(data))}


def finite_reference_cost(row, field):
    try:
        value = float(row[field])
        return round(value, 2) if math.isfinite(value) and value >= 0 else None
    except (KeyError, ValueError, TypeError):
        return None


@app.post("/assess-warranty", response_model=WarrantyAssessmentResult)
def assess_warranty(data: WarrantyAssessmentInput):
    """Compare a quote with service estimates; this does not determine coverage."""
    values = normalize_service_input(data.service)
    prediction = predict_values(values)
    ratio = (data.requested_amount - prediction) / prediction if prediction > 0 else None
    reasons = []
    if ratio is None:
        reasons.append("The model returned zero cost; a quote comparison requires manual review.")
    elif abs(ratio) > MAX_AMOUNT_DEVIATION:
        direction = "above" if ratio > 0 else "below"
        reasons.append(f"The requested amount is {abs(ratio):.1%} {direction} the service estimate, exceeding the 25% review threshold.")

    support_key = tuple(str(values[key]) for key in VEHICLE_FIELDS) + (str(values["mileage_range"]),)
    support = TRAINING_SUPPORT.get(support_key, {"matching_records": 0, "minimum_mileage": None, "maximum_mileage": None})
    minimum, maximum = support["minimum_mileage"], support["maximum_mileage"]
    within_range = bool(support["matching_records"] and minimum <= values["mileage"] <= maximum)
    if not support["matching_records"]:
        reasons.append("No training records match this vehicle and service interval; manual review is required.")
    elif not within_range:
        reasons.append("Vehicle mileage is outside the observed range for this vehicle and service interval.")
    triage = "review" if reasons else "within_estimate"
    if not reasons:
        reasons.append("The requested amount is within 25% of the service estimate and mileage is within the observed training range.")

    reference_key = tuple(values[key] for key in REFERENCE_KEYS)
    component_row = COMPONENT_REFERENCES.get(reference_key, {})
    reference_items = []
    for field, (reference_field, label) in COMPONENT_MAPPING.items():
        cost = finite_reference_cost(component_row, reference_field)
        if values[field] and cost is not None:
            reference_items.append({
                "field": field, "label": label, "cost": cost,
                "source": f"component_cost_clean.csv:{reference_field}",
            })
    mapped_fields = {item["field"] for item in reference_items}
    # Above80k is one reference category; never extrapolate a new 100k price.
    reference_interval = min(values["mileage_range"], 80000)
    scheduled_cost = finite_reference_cost(
        SCHEDULED_REFERENCES.get(reference_key, {}), f"cost{reference_interval // 1000}k",
    )

    return {
        "currency": "INR",
        "requested_amount": round(data.requested_amount, 2),
        "predicted_service_cost": prediction,
        "amount_deviation_ratio": round(ratio, 6) if ratio is not None else None,
        "triage": triage,
        "reasons": reasons,
        "informational_only": True,
        "reference_cost": round(sum(item["cost"] for item in reference_items), 2) if reference_items else None,
        "scheduled_reference_cost": scheduled_cost,
        "scheduled_reference_interval_km": reference_interval if scheduled_cost is not None else None,
        "reference_items": reference_items,
        "unmapped_selected_components": [field for field in SERVICE_FLAGS if values[field] and field not in mapped_fields],
        "reference_provenance": {
            "matching_fields": list(REFERENCE_KEYS),
            "component_source": "component_cost_clean.csv" if reference_items else None,
            "scheduled_source": "mandatory_service_clean.csv" if scheduled_cost is not None else None,
            "scheduled_category": "80,000 km and above" if reference_interval == 80000 else f"{reference_interval:,} km",
            "scope": "Selected mapped parts subtotal and scheduled package cost are separate historical references; they are not summed into a repair quote.",
        },
        "training_support": {
            **support, "mileage_within_observed_range": within_range,
        },
        "model_validation": model_validation_summary(),
        "policy": {"maximum_relative_deviation": MAX_AMOUNT_DEVIATION, "decision": "Informational quote triage only; manual assessment determines coverage."},
        "limitations": [
            "A service-cost estimate cannot establish warranty eligibility, covered components, fraud, or claim approval.",
            "Reference prices may exclude labour, taxes, regional differences, and unmapped components.",
            "Financing records must be linked by an explicit case ID; these service data do not establish borrower creditworthiness or lender approval.",
        ],
    }

@app.get("/health")
def health():
    return {
        "status": "ready", "currency": "INR",
        "supported_vehicle_combinations": len(SUPPORTED_VEHICLES),
        "warranty_assessment": "informational_quote_triage",
        "model_validation": model_validation_summary(),
        "reference_vehicle_combinations": {
            "components": len(COMPONENT_REFERENCES), "scheduled_service": len(SCHEDULED_REFERENCES),
        },
    }
