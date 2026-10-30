# Integrated Automotive Warranty and Financing Management System

Plutus Auto connects vehicle registration, warranty policies and claims, financing, portfolio management, reports, and follow-up notes. A fraud-screening model is a supporting feature in the same workflow. The overview is the default page.

## Connected features

- **Overview:** account totals, warranty activity, financed principal, overdue balances, and navigation into the operational workflows.
- **Vehicle & financing:** register any supported-format vehicle, owner, policy, and loan in one shared record; edit records; calculate EMI, interest and repayments; review obligations and entered overdue balances.
- **Warranty:** create a case linked to a registered vehicle; check policy dates, mileage, components, claim limits and duplicates; view that vehicle’s financing; record and retain staff decisions.
- **Model-assisted review:** optionally map a saved case to a supported defect and dealer, run fraud screening automatically, and open model details from the same case. Missing mappings skip the model rather than inventing identifiers. Existing cases can add or update their mappings.
- **Risk review:** current policy states, model availability, pending claim amounts and loan facts, plus a clearly separate training-data reference.
- **Portfolio:** registered vehicles with policies, original loan principal, EMI and links to their warranty cases.
- **Reports:** export linked policy checks, financing facts, staff decisions and experimental model scores, with status filtering. Training-claim exports remain separate.
- **Desk notes:** save warranty, financing, dealer and general follow-ups with due dates and completion status.
- **Model tools:** manual screening, searchable/filterable training claims and CSV export, and transparent evaluation. Switching tabs retains current inputs, results and filters; refresh reloads saved account records.

The system links operational records by an explicit vehicle ID, not by similar names or by joining unrelated datasets. Loan facts accompany warranty review; overdue balances and fraud scores do not automatically approve or reject a warranty. The loan planner is a calculation from entered terms, not a trained credit approval model.

## Dataset and model

`Data/warranty_claims.csv` is an unchanged copy of the supplied `dataset (1).csv`: 500 automotive warranty claims, 13 fraud flags, 429 historical approvals, five defects, and five dealers. Repair costs explicitly use INR. The supplied dictionary is preserved in `Data/claims_data_dictionary.csv`; its learner placeholders are source text rather than instructions.

The new claims data replaces the old training datasets and service-cost model. This does **not** remove warranty or financing management. Vehicle entry and policy validation are independent of the fraud-training population, so makes, models, and locations are no longer restricted to old maintenance training combinations. Static component choices are in `src/data/vehicleOptions.json`.

Existing account records in SQLite/PostgreSQL are preserved and are not silently added to training. Training claims have masked VINs and no verified join to operational vehicle records. The app never assigns those rows to registered owners or loan accounts.

## Run locally

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
python -m ml.train_claims_model
python -m uvicorn backend.main:app --reload --port 8000
```

In another terminal:

```sh
npm install
npm run dev
```

Open the Vite URL and sign in or register. The frontend proxies `/api` to port 8000. Local development uses `Data/plutus.sqlite3` unless database configuration overrides it. Do not delete this file when replacing training data. Records use account isolation and revision checks to protect against stale saves across devices. Theme preference is browser-local. Existing browser records can be imported into empty account collections from Overview.

## Evaluation and limitations

The model uses defect, dealer, repair cost and claim month. IDs, approval decisions and the fraud target are excluded from predictors. Masked VINs are used only to group evaluation partitions.

Three stratified grouped folds within 400 training rows select a candidate by average precision. A separate 100-row grouped holdout contains three flagged claims. The selected random forest has average precision **0.0337**, ROC AUC **0.3643**, and Brier score **0.02955**. The constant-rate baseline has average precision **0.0300** and Brier score **0.02912**. The candidate fails the combined improvement check and misses all three flagged holdout records at a 0.5 threshold.

The final experimental artifact is refit on all 500 rows. Scores for those historical rows are in-sample; holdout metrics belong to the separate evaluation model. There are only 13 positive examples and dataset provenance has not been verified. Scores are uncalibrated and unsuitable for automated claim decisions. Every case requires human review; the app displays this limitation and warns about dates or costs outside the observed range. Better fraud performance needs additional verified labels and independent future-period validation.

Reproduce the model and report with `python -m ml.train_claims_model`. Restart the backend after regeneration. Outputs are `Data/processed/claims_fraud_model.joblib`, `claims_fraud_model.json` and `claims_model_evaluation.json`. The deployed scorer uses compact JSON parameters and the Python standard library; training-only NumPy, pandas and scikit-learn are excluded from runtime dependencies. Export parity is verified against the trained pipeline for all 500 records. The CSV and evaluation are committed; the trained binary is generated. Old service-cost routes and obsolete data summaries are not used by the integrated application.

## Checks

```sh
npm run lint
npm run build
npm test
npm run test:pages
.venv/bin/python -m unittest discover -s backend/tests -v
```

The page smoke check covers all ten management and model routes. API tests include arbitrary vehicle registration, linked case storage, financial facts, accounts, model inference, invalid inputs, source fingerprints and grouped evaluation.

## Browser integration checks

The browser check uses Chrome CDP through Node’s built-in WebSocket. It creates disposable accounts, so run it against a separate database. Start an isolated backend and frontend in separate terminals:

```sh
env DATABASE_URL= POSTGRES_URL= VERCEL= PLUTUS_SQLITE_PATH=/private/tmp/plutus-integrated-check.sqlite3 .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
env PLUTUS_API_TARGET=http://127.0.0.1:8001 npm run dev -- --host 127.0.0.1 --port 5174
```

Start Chrome with a temporary profile, then run the check:

```sh
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless=new --remote-debugging-port=9222 --user-data-dir=/private/tmp/plutus-tabs-chrome --no-first-run --no-default-browser-check about:blank
PLUTUS_TEST_URL=http://127.0.0.1:5174 npm run test:browser
```

It verifies registration, loan/policy/vehicle creation, portfolio-to-warranty links, automatic model checks, saved staff decisions, notes and refresh persistence, all ten routes, mobile containment, model-tab state, search/filter/pagination, filtered CSV contents, browser history, theme persistence, error recovery and sign-out.

## Deployment

`api/index.py` mounts the complete backend under `/api`. Vercel uses `uv run --no-project --with-requirements ml/requirements.txt` to regenerate the model in an isolated build environment, then packages the new CSV, model, report and vehicle validation options. Existing production account/database configuration is preserved. These changes do not deploy the application.

## Demo scenarios

Overview’s **Add demo examples** button adds six synthetic vehicle/financing/policy accounts, ten linked warranty claims and six follow-ups to the signed-in account. The examples cover all four claim statuses, five model defect categories, expired coverage, excess mileage, an uncovered component and excess amount, duplicate claims, missing model mappings, overdue financing and a zero-interest loan. Notes cover Warranty, Financing, Dealer and General, with open and completed items.

Demo owners and vehicle registrations are visibly labeled; a banner identifies their inclusion, and operational report CSVs carry `demo_record` flags. Demo examples do not enter model training or supply fraud labels. Repeated loading adds only missing demo IDs, preserving both existing records and edits to previously loaded examples. All three collections are added in one transaction.

For local setup, `python scripts/seed_demo_data.py --username YOUR_EXISTING_USERNAME` adds the same examples to one explicitly selected account using the configured database. Dates are relative to the load date in Asia/Kolkata, so policy and follow-up scenarios remain useful.
