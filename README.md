# Plutus Auto

React dashboard backed by a trained service-cost model. All monetary values use INR.

## Run locally

From the `Plutus` directory:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
```

In another terminal, from `Plutus`:

```sh
npm install
npm run dev
```

Open the Vite URL. The dev server proxies `/api` requests to port 8000. A production deployment must also route `/api` to the backend and remove the `/api` prefix.

The saved scikit-learn model should run with the same package versions used to train it. If loading reports version incompatibility, use the training environment versions or retrain and export using the installed version.

## Data and actions

- Vehicle options, years, engines, regions, service intervals, and component flags follow `Data/processed/service_records_clean.csv` and the feature schema in `ml/notebooks/04_data_integration.ipynb`.
- The model expects lowercase categories: `honda` / `toyota`, `amaze` / `city` / `jazz` / `fortuner`, `petrol` / `diesel`, and `chennai` / `mumbai`. `mileage_range` is the selected service interval; `mileage` is actual mileage.
- Portfolio costs and service frequencies summarize 1,139 records. Financing statistics summarize 10,000 credit records. These are dataset summaries, not live loan or insurance predictions.
- New Case creates a warranty case in browser local storage. Status changes persist after refresh. The training datasets do not contain warranty claims or coverage decisions.
- Review today's queue shows pending cases; View All expands the queue; Open Portfolio scrolls to model costs. Navigation links move to their sections.
- Export downloads service records; Reports also exports local warranty cases and model summaries. CSV amounts are INR numbers.
- `src/components/ServiceEstimator.jsx` handles prediction; `NewCaseDialog.jsx` handles case creation; `src/utils/actions.js` contains navigation, export, storage, and currency helpers.

After changing the processed CSVs, regenerate the dashboard snapshot:

```sh
python3 scripts/generate_dashboard_data.py
```

## Reliability and verification

The JavaScript bundle contains only summaries and supported vehicle options. Full service records download on demand from `public/service-records-INR.csv`; regenerate this CSV and the summary together after updating training data.

Warranty cases stay in local browser storage. Corrupt storage produces an error and is preserved instead of silently replaced. Changes from other tabs refresh the queue; a stale save is rejected. Browser storage is not a central database or a backup: export cases before clearing browser data.

Prediction inputs lock during requests to avoid displaying estimates for changed inputs. Requests time out after 15 seconds. The backend validates supported combinations, intervals, binary flags, and finite nonnegative mileage; invalid model outputs return a controlled 503 response. `/health` reports readiness. Runtime dependency versions are pinned to the environment verified with the saved model. Vite preview also proxies `/api` locally.

Run checks from `Plutus`:

```sh
npm run build
npm run lint
npm test
.venv/bin/python -m unittest discover -s backend/tests -v
```

The backend tests require a test client dependency:

```sh
pip install -r backend/requirements-dev.txt
```

Tests cover real model inference, malformed API inputs, invalid model output, summaries, case corruption, rupee formatting, and CSV escaping.

## Reproducible model improvement experiment

From `Plutus`, run:

```sh
.venv/bin/python -m ml.train_service_model
```

The script cleans raw service records, component prices (including Indian comma-separated numbers), and mandatory-service reference costs. Reference tables join on brand/model/engine and are embedded inside the fitted candidate so prediction does not depend on re-reading those CSVs. The API feature contract stays unchanged.

Similar records differing only in actual mileage are kept in one evaluation group. Model selection uses three grouped training folds; a separate grouped 20% holdout gates replacement. The baseline is retrained from the current pipeline configuration on the same training partition, rather than comparing against the deployed model that already saw all existing records. Promotion requires more than 2% improvement in holdout MAE. A previous active artifact is preserved before successful promotion.

Outputs:

- `Data/processed/component_cost_clean.csv` and `mandatory_service_clean.csv`: cleaned reference tables.
- `Data/processed/service_model_evaluation.json`: metrics, selection rules, source audit, and raw-data hash.
- `Data/processed/service_cost_model.candidate.pkl`: experimental model; the backend continues using `service_cost_model.pkl` unless promotion passes.

In the first experiment the selected reference-enriched gradient model improved grouped cross-validation MAE (₹798 → ₹681), but worsened separate holdout MAE (₹831 → ₹864). It was **not promoted**. Holdout R² was 0.780 for the baseline versus 0.735 for the candidate. The raw service CSV is identical to the existing 1,139 cleaned rows; no additional labeled service examples were found.

Auction sale prices, safety specifications, credit scores, appliance warranty-fraud data, and submission placeholders are excluded from the maintenance target. Their units, populations, or labels differ. The service dataset contains costs but no explicit currency metadata; the app retains its existing INR assumption, and auction prices are never treated as INR service costs. Scheduled reference costs must be available at prediction time and independent of observed service bills; their provenance should be confirmed before deployment.

This evaluation measures unseen service-feature combinations within the current small dataset. It does not establish accuracy for new makes, locations, years, or future bills. Further tuning needs fresh validation data rather than repeated tuning against this holdout. After a model promotion that changes cleaned service records, regenerate frontend data with `python3 scripts/generate_dashboard_data.py` and restart the backend.

## Warranty and financing workspace

The dashboard includes a vehicle loan planner with fixed-rate EMI, total interest, and repayment totals in INR. It is a calculator, not lender approval or a credit-model prediction. Desk Notes tracks warranty, financing, dealer, and general follow-ups with optional due dates, completion, and deletion. Notes are stored locally; damaged storage is preserved, and stale writes from another tab are rejected.

The header's Light/Dark button switches between emerald-and-gold themes and remembers the preference. On first visit the theme follows the operating system. Animated background colours respect reduced-motion preferences. Cases, notes, and theme preferences remain browser-local; this version does not provide centralized account synchronization.

## Separate workspace pages

Navigation now opens one dedicated page at a time:

- `#/overview`: executive summary, case totals, and regional/cost insights.
- `#/warranty`: claim queue, status management, and service cost estimator.
- `#/financing`: vehicle loan planner and credit dataset summaries.
- `#/risk`: exposure indicators and maintenance charts.
- `#/reports`: CSV exports and filtered warranty reports.
- `#/notes`: follow-up notes board.
- `#/portfolio`: model-level service portfolio.

Each page has a separate component in `src/pages`. Shared theme, case storage, and the New Case dialog remain in the app shell. Links work with browser Back/Forward and refresh; hash routing avoids requiring server rewrite configuration. Older section bookmarks still open the corresponding page. Loan planner inputs reset when leaving Financing; saved cases, notes, and theme preferences persist.

## Linked warranty, financing, and automatic screening

1. Open **Financing** and register a vehicle with its owner, registration ID, supported service profile, loan terms, income/other EMI/overdue balance, and entered warranty dates, mileage limit, per-claim limit, and covered components. Records can be edited in the same form.
2. Use **New case** to select that vehicle, a component, claim date, mileage, and requested INR amount. The owner and vehicle are populated from the shared record. Initial policy failures route the case to Review.
3. The **Warranty** page checks owner match, inclusive coverage dates, claim mileage, component coverage, per-claim limits, and matching duplicate submissions automatically. Expand a case for individual reasons. Changes to linked terms re-run local checks. Older unlinked cases can be completed using the link form inside their details.
4. The backend's `POST /assess-warranty` compares the claim amount with the active service-cost model. It flags absolute deviations above 25%, or mileage beyond the observed training range, for cost review. It separately displays mapped clutch/brake-pad prices and scheduled-package references; unmapped prices stay missing rather than zero. At most two requests run together; successful assessments are cached by exact input for the session, cancelled if inputs change, and have a 15-second timeout. **Retry model checks** clears that cache.
5. **Financing** displays each registered vehicle's EMI, obligation-to-income ratio, entered overdue balance, linked claims, and policy-check attention counts. Its linked-case button opens a filtered Warranty queue. Financing facts are reviewed in parallel and never determine warranty entitlement. The original financed principal is not a remaining repayment balance.
6. **Risk** charts separate current local cases/accounts from historical service, credit, and safety sources. Zero-baseline service-cost graphs use numeric mileage intervals; credit bands and safety-rating distributions have table alternatives. Model unavailable/checking states and unlinked cases are visible. **Reports** exports the shared vehicle/financing register and cross-referenced claim checks alongside historical summaries.

Policy checks use the terms entered by the user. They do not verify invoices, policy authenticity, identity, fraud, payment settlement, or a lender's decision. No labeled automotive warranty outcomes or shared borrower IDs exist in the CSVs, so the app does not invent a warranty-approval model or join unrelated credit rows to customers. Staff decisions remain explicit and store timestamped local status history. No automatic payment or loan approval is performed. Records remain in this browser rather than a central database.

The earlier reference-enriched model failed the separate holdout test, so the active service model remains unchanged. Cross-reference assessment enhances the workflow around that model instead of claiming improved prediction accuracy.

## Audited risk data

Regenerate dashboard summaries and the audit with:

```sh
python3 scripts/generate_dashboard_data.py
```

`Data/processed/risk_data_audit.json` records source hashes, checks against raw and processed data, valid denominators, missing-value counts, unmatched reference rows, and excluded datasets. All 10,000 credit rows reproduce the raw risk summaries: 1,551 scores below 600, 1,505 with recorded payment bounces, and mean obligation-to-income ratio 52.45%. These are descriptive dataset indicators.

The safety reference contains 17,312 unique configurations after removing one exact duplicate, with 5,484 overall-star-rated and 11,828 unrated rows. None match the service vehicle profiles; safety ratings are therefore shown only as a separate reference distribution. The original 1,139 service labels are unchanged. Source CSVs do not explicitly record currency; INR remains the maintenance UI assumption and auction sale prices are excluded.

For a rendering check of all seven pages and linked record fixtures (held only in test memory):

```sh
npm run test:pages
```

# Projects
