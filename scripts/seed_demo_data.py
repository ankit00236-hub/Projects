"""Append synthetic demo records to one explicitly selected existing account."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.database import connection
from backend.demo_data import seed_demo_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--username', required=True)
    args = parser.parse_args()
    with connection() as db:
        row = db.execute('SELECT id FROM app_users WHERE username=%s', (args.username.lower(),)).fetchone()
    if not row:
        raise SystemExit('Account not found. Register the account before adding examples.')
    print(json.dumps(seed_demo_data(row[0]), indent=2))


if __name__ == '__main__':
    main()
