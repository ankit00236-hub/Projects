"""Expose the claim screening API under the dashboard's production API prefix."""
from fastapi import FastAPI

from backend.main import app as claims_app

app = FastAPI()
app.mount("/api", claims_app)
