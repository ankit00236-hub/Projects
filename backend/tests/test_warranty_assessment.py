import json
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app


class WarrantyAssessmentTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        root = Path(__file__).resolve().parents[2]
        self.service = json.loads((root / "src/data/trainingData.json").read_text())["initialForm"]

    def assess(self, amount=4000, service=None):
        return self.client.post("/assess-warranty", json={
            "service": service or self.service, "requested_amount": amount,
        })

    def test_real_estimate_is_informational_and_matches_prediction(self):
        prediction = self.client.post("/predict-service-cost", json=self.service).json()["predicted_service_cost"]
        response = self.assess(prediction)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["predicted_service_cost"], prediction)
        self.assertEqual(body["amount_deviation_ratio"], 0)
        self.assertEqual(body["triage"], "within_estimate")
        self.assertTrue(body["informational_only"])
        self.assertGreater(body["training_support"]["matching_records"], 0)
        self.assertEqual(body["currency"], "INR")
        self.assertIn("not a warranty-coverage", body["model_validation"]["scope"])

    def test_quote_threshold_both_directions_and_boundary(self):
        with patch("backend.main.model.predict", return_value=[4000]):
            for amount, triage, ratio in ((5000, "within_estimate", 0.25), (5001, "review", 0.25025), (2999, "review", -0.25025)):
                with self.subTest(amount=amount):
                    body = self.assess(amount).json()
                    self.assertEqual(body["triage"], triage)
                    self.assertEqual(body["amount_deviation_ratio"], ratio)

    def test_mapped_parts_are_separate_from_scheduled_package(self):
        service = {**self.service, "clutch": 1, "brake_pads": 1, "brand": " HONDA "}
        with patch("backend.main.model.predict", return_value=[7000]):
            response = self.assess(7000, service)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["reference_cost"], 2640 + 2849)
        self.assertEqual(body["scheduled_reference_cost"], 2010)
        self.assertEqual(body["scheduled_reference_interval_km"], 10000)
        self.assertEqual({item["field"] for item in body["reference_items"]}, {"clutch", "brake_pads"})
        self.assertEqual({item["source"] for item in body["reference_items"]}, {
            "component_cost_clean.csv:clutch_plate", "component_cost_clean.csv:barke_pad",
        })
        self.assertIn("whell_alignment_and_balancing", body["unmapped_selected_components"])

    def test_missing_references_are_null_not_zero(self):
        with patch("backend.main.COMPONENT_REFERENCES", {}), patch("backend.main.SCHEDULED_REFERENCES", {}):
            body = self.assess(service={**self.service, "clutch": 1}).json()
        self.assertIsNone(body["reference_cost"])
        self.assertIsNone(body["scheduled_reference_cost"])
        self.assertEqual(body["reference_items"], [])
        self.assertIn("clutch", body["unmapped_selected_components"])

    def test_above_80k_category_does_not_invent_a_100k_price(self):
        service = {**self.service, "mileage_range": 100000, "mileage": 100000}
        body = self.assess(service=service).json()
        self.assertEqual(body["scheduled_reference_cost"], 6245)
        self.assertEqual(body["scheduled_reference_interval_km"], 80000)
        self.assertEqual(body["reference_provenance"]["scheduled_category"], "80,000 km and above")

    def test_unobserved_mileage_requires_review_despite_matching_quote(self):
        with patch("backend.main.model.predict", return_value=[4000]):
            body = self.assess(4000, {**self.service, "mileage": 900000}).json()
        self.assertEqual(body["triage"], "review")
        self.assertFalse(body["training_support"]["mileage_within_observed_range"])
        self.assertTrue(any("observed range" in reason for reason in body["reasons"]))

    def test_zero_prediction_and_unavailable_model_are_controlled(self):
        with patch("backend.main.model.predict", return_value=[0]):
            body = self.assess().json()
            self.assertEqual(body["triage"], "review")
            self.assertIsNone(body["amount_deviation_ratio"])
        with patch("backend.main.model.predict", side_effect=RuntimeError("model failure")):
            self.assertEqual(self.assess().status_code, 503)

    def test_invalid_request_and_existing_service_validation(self):
        for amount in (0, 0.001, -1, True, "4000", "NaN", "Infinity", 1e20):
            with self.subTest(amount=amount):
                self.assertEqual(self.assess(amount).status_code, 422)
        self.assertEqual(self.assess(service={**self.service, "brand": "ford"}).status_code, 422)
        self.assertEqual(self.assess(service={**self.service, "clutch": 2}).status_code, 422)
        self.assertEqual(self.client.post("/assess-warranty", json={
            "service": self.service, "requested_amount": 4000, "approve": True,
        }).status_code, 422)

    def test_health_describes_validation_and_kept_model(self):
        body = self.client.get("/health").json()
        self.assertEqual(body["warranty_assessment"], "informational_quote_triage")
        self.assertFalse(body["model_validation"]["candidate_promoted"])
        self.assertGreater(body["reference_vehicle_combinations"]["components"], 0)


if __name__ == "__main__":
    unittest.main()
