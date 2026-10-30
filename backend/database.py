"""Account-scoped durable storage. PostgreSQL in production; SQLite for development."""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter()
COOKIE = "plutus_session"
COLLECTIONS = {"assets", "cases", "notes"}


@contextmanager
def connection():
    url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if url:
        import psycopg
        try:
            conn = psycopg.connect(url, connect_timeout=10)
        except Exception:
            raise HTTPException(503, "Database connection is unavailable. Please retry.") from None
    else:
        if os.environ.get("VERCEL"):
            raise HTTPException(503, "Database is not configured.")
        path = os.environ.get("PLUTUS_SQLITE_PATH", str(Path(__file__).resolve().parents[1] / "Data" / "plutus.sqlite3"))
        conn = sqlite3.connect(path, timeout=10)
        conn.execute("PRAGMA foreign_keys=ON")
    class DB:
        def execute(self, sql, params=()):
            return conn.execute(sql if url else sql.replace("%s", "?").replace(" FOR UPDATE", ""), params)
    try:
        db = DB()
        db.execute("CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS app_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, expires BIGINT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS app_records (user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE, collection TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(user_id, collection))")
        db.execute("CREATE TABLE IF NOT EXISTS app_auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets BIGINT NOT NULL)")
        yield db
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(503, "Database request failed. Please retry.") from None
    finally:
        conn.close()


def write_request(request: Request):
    if request.headers.get("X-Plutus-Request") != "1":
        raise HTTPException(403, "Use the Plutus application to make changes.")
    origin = request.headers.get("origin")
    if origin:
        from urllib.parse import urlsplit
        local_origin = not os.environ.get("VERCEL") and origin in {"http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"}
        if not local_origin and urlsplit(origin).netloc != request.headers.get("host"):
            raise HTTPException(403, "Cross-origin changes are not allowed.")


def auth_rate_limit(request):
    # Persist limits so separate serverless instances enforce the same budget.
    address = request.headers.get("x-vercel-forwarded-for", "") if os.environ.get("VERCEL") else ""
    key = hashlib.sha256((address or (request.client.host if request.client else "unknown")).encode()).hexdigest()
    now = int(time.time())
    with connection() as db:
        row = db.execute("INSERT INTO app_auth_limits(key, attempts, resets) VALUES (%s, 1, %s) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN app_auth_limits.resets < %s THEN 1 ELSE app_auth_limits.attempts+1 END, resets=CASE WHEN app_auth_limits.resets < %s THEN %s ELSE app_auth_limits.resets END RETURNING attempts", (key, now + 60, now, now, now + 60)).fetchone()
    if row[0] > 15:
        raise HTTPException(429, "Too many sign-in attempts. Try again in a minute.")


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600000).hex()
    return salt + ":" + digest


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9_.@-]+$")
    password: str = Field(min_length=12, max_length=128)


def current_user(request: Request):
    token = request.cookies.get(COOKIE, "")
    with connection() as db:
        row = db.execute("SELECT u.id, u.username FROM app_users u JOIN app_sessions s ON s.user_id=u.id WHERE s.token=%s AND s.expires>%s", (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
    if not row:
        raise HTTPException(401, "Sign in to access saved records.")
    return {"id": row[0], "username": row[1]}


def issue_session(db, user_id, response):
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM app_sessions WHERE expires<%s", (int(time.time()),))
    db.execute("INSERT INTO app_sessions VALUES (%s,%s,%s)", (hashlib.sha256(token.encode()).hexdigest(), user_id, int(time.time()) + 604800))
    response.set_cookie(COOKIE, token, httponly=True, secure=bool(os.environ.get("VERCEL")), samesite="strict", max_age=604800, path="/api")
    response.headers["Cache-Control"] = "no-store"


@router.post("/auth/register", dependencies=[Depends(write_request)])
def register(body: Credentials, request: Request, response: Response):
    auth_rate_limit(request)
    username = body.username.lower()
    hashed = password_hash(body.password)
    with connection() as db:
        user_id = secrets.token_hex(16)
        inserted = db.execute("INSERT INTO app_users VALUES (%s,%s,%s) ON CONFLICT(username) DO NOTHING RETURNING id", (user_id, username, hashed)).fetchone()
        if not inserted:
            raise HTTPException(409, "This username is already registered.")
        issue_session(db, user_id, response)
    return {"username": username}


@router.post("/auth/login", dependencies=[Depends(write_request)])
def login(body: Credentials, request: Request, response: Response):
    auth_rate_limit(request)
    with connection() as db:
        row = db.execute("SELECT id,password FROM app_users WHERE username=%s", (body.username.lower(),)).fetchone()
        saved = row[1] if row else "00" * 16 + ":" + "00" * 32
        if not hmac.compare_digest(password_hash(body.password, saved.split(":")[0]), saved) or not row:
            raise HTTPException(401, "Incorrect username or password.")
        issue_session(db, row[0], response)
    return {"username": body.username.lower()}


@router.get("/auth/me")
def me(response: Response, user=Depends(current_user)):
    response.headers["Cache-Control"] = "no-store"
    return {"username": user["username"]}


@router.post("/auth/logout", dependencies=[Depends(write_request)])
def logout(request: Request, response: Response):
    with connection() as db:
        db.execute("DELETE FROM app_sessions WHERE token=%s", (hashlib.sha256(request.cookies.get(COOKIE, "").encode()).hexdigest(),))
    response.delete_cookie(COOKIE, path="/api")
    return {"ok": True}


class Records(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0, strict=True)
    records: list[dict] = Field(max_length=5000)


def validate_records(collection, records):
    if len(json.dumps(records, allow_nan=False)) > 2_000_000:
        raise ValueError("Record collection is too large.")
    ids = set()
    registrations = set()
    for item in records:
        if not isinstance(item.get("id"), str) or not item["id"] or len(item["id"]) > 128 or item["id"] in ids:
            raise ValueError("Record IDs must be present and unique.")
        ids.add(item["id"])
        if collection == "notes":
            if not isinstance(item.get("text"), str) or not 1 <= len(item["text"].strip()) <= 500 or not isinstance(item.get("done"), bool) or item.get("category") not in {"Warranty", "Financing", "Dealer", "General"}:
                raise ValueError("Invalid note.")
        elif collection == "cases":
            if item.get("status") not in {"Pending", "Review", "Approved", "Rejected"} or not isinstance(item.get("amount"), (int, float)) or isinstance(item["amount"], bool) or item["amount"] <= 0 or not all(isinstance(item.get(k), str) and item[k].strip() for k in ["owner", "vehicle", "claim"]):
                raise ValueError("Invalid warranty case.")
        else:
            from datetime import date
            if not all(isinstance(item.get(k), str) and item[k].strip() for k in ["owner", "registration"]):
                raise ValueError("Owner and registration are required.")
            registration = item["registration"].strip().upper()
            if registration in registrations:
                raise ValueError("Vehicle registrations must be unique.")
            registrations.add(registration)
            policy, loan, service = item["policy"], item["loan"], item["service"]
            if date.fromisoformat(policy["start"]) > date.fromisoformat(policy["end"]) or policy["maxMileage"] < 0 or policy["claimLimit"] <= 0 or not policy["components"]:
                raise ValueError("Invalid policy terms.")
            if not 0 <= loan["down"] < loan["price"] or not 1 <= loan["months"] <= 360 or loan["rate"] < 0 or item["monthlyIncome"] <= 0 or item["existingEmi"] < 0 or item["overdueAmount"] < 0:
                raise ValueError("Invalid financing terms.")
            # Vehicle registration is independent of the claim-fraud training population.
            import math
            options = json.loads((Path(__file__).resolve().parents[1] / "src/data/vehicleOptions.json").read_text())
            if not all(isinstance(service.get(key), str) and 0 < len(service[key].strip()) <= 80 for key in ("brand", "model", "engine_type", "region")):
                raise ValueError("Enter vehicle details.")
            numbers = [service.get("make_year"), service.get("mileage"), service.get("mileage_range"), policy["maxMileage"], policy["claimLimit"], loan["price"], loan["down"], loan["months"], loan["rate"], item["monthlyIncome"], item["existingEmi"], item["overdueAmount"]]
            if not all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in numbers):
                raise ValueError("Numeric fields must be finite numbers.")
            if not 1900 <= service["make_year"] <= 2100 or service["make_year"] % 1 or service["mileage"] < 0 or service["mileage_range"] <= 0 or loan["months"] % 1:
                raise ValueError("Invalid vehicle or loan fields.")
            if any(component not in options["flags"] for component in policy["components"]):
                raise ValueError("Invalid policy component.")


def check_collection(collection):
    if collection not in COLLECTIONS:
        raise HTTPException(404, "Unknown record collection.")


@router.get("/records/{collection}")
def read_records(collection: str, response: Response, user=Depends(current_user)):
    check_collection(collection)
    response.headers["Cache-Control"] = "no-store"
    with connection() as db:
        row = db.execute("SELECT payload,revision FROM app_records WHERE user_id=%s AND collection=%s", (user["id"], collection)).fetchone()
    return {"records": json.loads(row[0]) if row else [], "revision": row[1] if row else 0}


@router.put("/records/{collection}", dependencies=[Depends(write_request)])
def save_records(collection: str, body: Records, response: Response, user=Depends(current_user)):
    check_collection(collection)
    try:
        validate_records(collection, body.records)
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, "Invalid records. Check the entered fields.") from None
    payload = json.dumps(body.records, allow_nan=False)
    with connection() as db:
        # Serialize related changes for one account before checking vehicle links.
        db.execute("SELECT id FROM app_users WHERE id=%s FOR UPDATE", (user["id"],)).fetchone()
        if collection in {"assets", "cases"}:
            other = "assets" if collection == "cases" else "cases"
            stored = db.execute("SELECT payload FROM app_records WHERE user_id=%s AND collection=%s", (user["id"], other)).fetchone()
            other_records = json.loads(stored[0]) if stored else []
            assets = other_records if collection == "cases" else body.records
            cases = body.records if collection == "cases" else other_records
            asset_ids = {item["id"] for item in assets}
            if any(item.get("assetId") and item["assetId"] not in asset_ids for item in cases):
                raise HTTPException(422, "Every linked claim must reference a vehicle in your account. Import or register its vehicle first.")
        db.execute("INSERT INTO app_records VALUES (%s,%s,'[]',0) ON CONFLICT(user_id,collection) DO NOTHING", (user["id"], collection))
        row = db.execute("UPDATE app_records SET payload=%s,revision=revision+1 WHERE user_id=%s AND collection=%s AND revision=%s RETURNING revision", (payload, user["id"], collection, body.revision)).fetchone()
        if not row:
            raise HTTPException(409, "Records changed on another device. Reload and review before saving.")
    response.headers["Cache-Control"] = "no-store"
    return {"records": body.records, "revision": row[0]}


@router.post('/demo-data', dependencies=[Depends(write_request)])
def add_demo_data(user=Depends(current_user)):
    from backend.demo_data import seed_demo_data
    return seed_demo_data(user['id'])
