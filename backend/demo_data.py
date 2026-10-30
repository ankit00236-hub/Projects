"""Synthetic operational examples; never used as model training or fraud labels."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import json


def build_demo_data(today=None):
    today = today or datetime.now(ZoneInfo('Asia/Kolkata')).date()
    day = lambda offset: (today + timedelta(days=offset)).isoformat()
    stamp = f'{day(-5)}T09:00:00+05:30'
    assets = []
    specifications = [
        ('Asha Mehta', 'Maruti', 'Swift', 'Mumbai', 820000, 164000, 8.9, 60, 78000, 3000, 0, 100000, 80000, ['brake_pads', 'engine_oil', 'battery'], 365),
        ('Rohan Iyer', 'Honda', 'City', 'Chennai', 1450000, 300000, 9.5, 60, 95000, 8000, 12500, 100000, 100000, ['engine_oil', 'electrical_system', 'battery'], 240),
        ('Neha Shah', 'Hyundai', 'Creta', 'Pune', 1780000, 400000, 10.2, 72, 62000, 16000, 28500, 60000, 75000, ['air_conditioning', 'brake_pads'], 180),
        ('Kabir Singh', 'Tata', 'Nexon', 'Delhi', 1260000, 252000, 9.2, 60, 85000, 5000, 0, 80000, 60000, ['battery', 'electrical_system'], -30),
        ('Maya Rao', 'Toyota', 'Innova', 'Bengaluru', 2400000, 600000, 8.7, 84, 150000, 10000, 0, 150000, 150000, ['engine_oil', 'clutch', 'brake_pads'], 500),
        ('Dev Patel', 'Kia', 'Sonet', 'Ahmedabad', 1120000, 280000, 0, 48, 90000, 2000, 0, 90000, 65000, ['air_conditioning', 'battery', 'brake_pads'], 300),
    ]
    for index, (owner, brand, model, region, price, down, rate, months, income, existing, overdue, max_mileage, limit, components, end) in enumerate(specifications, 1):
        assets.append({'id': f'plutus-demo-v1-vehicle-{index}', 'owner': f'Demo · {owner}', 'registration': f'DEMO-AUTO-{index:02}', 'service': {'brand': brand, 'model': model, 'engine_type': 'petrol', 'make_year': 2023 + index % 2, 'region': region, 'mileage_range': 20000, 'mileage': 18000 + index * 4000}, 'loan': {'price': price, 'down': down, 'rate': rate, 'months': months}, 'monthlyIncome': income, 'existingEmi': existing, 'overdueAmount': overdue, 'policy': {'start': day(-730), 'end': day(end), 'maxMileage': max_mileage, 'claimLimit': limit, 'components': components}, 'updated': stamp, 'demo': True, 'source': 'synthetic_demo'})
    # Scenarios intentionally exercise each policy branch; staff statuses are fixtures.
    examples = [
        (1, 'brake_pads', 'Brake_Pad', 'DLR01', 18000, 12500, 'Pending', -3, 'Covered component; awaiting staff decision'),
        (2, 'engine_oil', 'Engine_Oil_Leak', 'DLR02', 32000, 42000, 'Approved', -12, 'Approved claim with a separate entered overdue loan balance'),
        (3, 'air_conditioning', 'AC_Malfunction', 'DLR03', 68000, 28000, 'Review', -2, 'Claim mileage exceeds policy limit'),
        (4, 'battery', 'Battery_Failure', 'DLR04', 36000, 18500, 'Rejected', -1, 'Claim submitted after policy expiry'),
        (5, 'engine_oil', 'Engine_Oil_Leak', 'DLR05', 58000, 95000, 'Pending', -4, 'Covered high-value repair'),
        (6, 'air_conditioning', 'AC_Malfunction', 'DLR03', 22000, 22000, 'Approved', -15, 'Covered repair on a zero-interest loan'),
        (1, 'brake_pads', 'Brake_Pad', 'DLR01', 20000, 14500, 'Review', -1, 'Potential duplicate invoice — first submission'),
        (1, 'brake_pads', 'Brake_Pad', 'DLR01', 20000, 14500, 'Review', -1, 'Potential duplicate invoice — repeated submission'),
        (3, 'electrical_system', 'Electrical_Short', 'DLR02', 45000, 98000, 'Rejected', -9, 'Component excluded and amount above claim limit'),
        (5, 'clutch', '', '', 62000, 36000, 'Pending', -2, 'Policy supported; no verified defect/dealer mapping for model'),
    ]
    claims = []
    for index, (vehicle, component, defect, dealer, mileage, amount, status, offset, scenario) in enumerate(examples, 1):
        asset = assets[vehicle - 1]
        claims.append({'id': f'plutus-demo-v1-claim-{index:02}', 'assetId': asset['id'], 'vehicle': f"{asset['service']['brand']} {asset['service']['model']}", 'owner': asset['owner'], 'claimKey': component, 'claim': component.replace('_', ' ').title(), 'claimDate': day(offset), 'mileage': mileage, 'amount': amount, 'defect_code': defect, 'dealer_id': dealer, 'status': status, 'created': stamp, 'decisions': [{'status': status, 'at': stamp, 'note': 'Synthetic demonstration decision'}], 'demo': True, 'source': 'synthetic_demo', 'demoScenario': scenario})
    note_specs = [
        ('Warranty', 'Request repair invoice for Demo · Asha Mehta’s brake claim.', 2, False),
        ('Financing', 'Follow up on Demo · Rohan Iyer’s entered overdue balance.', 1, False),
        ('Dealer', 'Ask DLR01 to verify the two matching demo brake invoices.', -1, False),
        ('Warranty', 'Explain the expired demo policy and review renewal documents.', 3, False),
        ('General', 'Review the demo portfolio and export the integrated report.', 5, False),
        ('Dealer', 'Demo dealer acknowledgement received for the AC repair.', -2, True),
    ]
    notes = [{'id': f'plutus-demo-v1-note-{index}', 'text': f'[DEMO] {text}', 'category': category, 'due': day(offset), 'done': done, 'demo': True, 'source': 'synthetic_demo'} for index, (category, text, offset, done) in enumerate(note_specs, 1)]
    return {'assets': assets, 'cases': claims, 'notes': notes}


def seed_demo_data(user_id, today=None):
    """Append atomically and idempotently, preserving existing and edited demo rows."""
    from backend.database import connection, validate_records
    from fastapi import HTTPException
    examples = build_demo_data(today)
    added, totals = {}, {}
    with connection() as db:
        if not db.execute('SELECT id FROM app_users WHERE id=%s FOR UPDATE', (user_id,)).fetchone():
            raise HTTPException(404, 'Account not found.')
        for collection in ('assets', 'cases', 'notes'):
            row = db.execute('SELECT payload,revision FROM app_records WHERE user_id=%s AND collection=%s', (user_id, collection)).fetchone()
            existing, revision = (json.loads(row[0]), row[1]) if row else ([], 0)
            by_id = {item['id']: item for item in existing}
            additions = [item for item in examples[collection] if item['id'] not in by_id]
            if any(item['id'] in by_id and not by_id[item['id']].get('demo') for item in examples[collection]):
                raise HTTPException(409, 'A demo identifier conflicts with an existing record.')
            if collection == 'assets' and any(a['registration'].upper() == b['registration'].upper() for a in additions for b in existing):
                raise HTTPException(409, 'A demo registration conflicts with an existing vehicle.')
            validate_records(collection, additions)
            merged = existing + additions
            if len(merged) > 5000 or len(json.dumps(merged)) > 2_000_000:
                raise HTTPException(422, 'There is not enough room in this collection for demo records.')
            if additions:
                db.execute("INSERT INTO app_records VALUES (%s,%s,'[]',0) ON CONFLICT(user_id,collection) DO NOTHING", (user_id, collection))
                saved = db.execute("UPDATE app_records SET payload=%s,revision=revision+1 WHERE user_id=%s AND collection=%s AND revision=%s RETURNING revision", (json.dumps(merged), user_id, collection, revision)).fetchone()
                if not saved:
                    raise HTTPException(409, 'Records changed while adding examples. Reload and try again.')
            added[collection], totals[collection] = len(additions), len(merged)
    return {'added': added, 'totals': totals, 'demo': True, 'message': 'Synthetic demo records added; existing records preserved.'}
