# Repository setup and local data

This repository contains the complete Plutus application source, configuration,
tests, UI assets, ML scripts, and aggregate dashboard/evaluation summaries.
The existing initial README commit is preserved.

Raw records, notebook outputs, trained model binaries, environments, dependencies,
and generated build outputs are intentionally excluded. They remain on the
original development machine. The aggregate JSON summaries contain counts,
distributions, supported vehicle profiles, and metrics rather than customer-level
credit rows or identifiable customer records.

## Frontend

From the repository root (the directory containing `package.json`):

```sh
npm ci
npm run dev
```

Overview, financing calculations, local warranty policy checks, risk graphs, and
notes use the committed summaries and browser-local records. Live model checks
need the backend and local model files. The full service-record CSV export also
needs `public/service-records-INR.csv`, which is excluded from Git.

A production frontend deployment should keep the full service-record export
unavailable unless its publication has been authorized. Restoring that CSV into
`public/` makes it downloadable and includes it in Vite builds; do not publish
private source records there.

## Backend data prerequisites

Obtain these files through an authorized private transfer from the project owner,
not from this Git repository:

- `Data/processed/service_cost_model.pkl`: the active trained service model.
- `Data/processed/service_records_clean.csv`: the validated service records used
  to check supported profiles and observed mileage ranges.

The backend loads these two files at startup; it cannot start without them.
Restore the following optional references to enable component/scheduled-cost
cross-reference details:

- `Data/processed/component_cost_clean.csv`
- `Data/processed/mandatory_service_clean.csv`

Aggregate model evaluation metadata is committed in
`Data/processed/service_model_evaluation.json`. Trained pickle/joblib files are
executable serialized objects: load only artifacts you trust.

Then follow the virtual environment and backend startup commands in `README.md`.
Use the pinned training/runtime package versions from `backend/requirements.txt`.

## Regeneration and model experiments

The dashboard generator requires the local raw service, credit, and safety CSVs
and the processed service and credit CSVs at the exact paths recorded in
`scripts/generate_dashboard_data.py` and
`Data/processed/risk_data_audit.json`. It regenerates both aggregate summaries
and the untracked full service CSV export.

`ml/train_service_model.py` also requires the existing active model plus raw
service records, standard component costs, and mandatory service reference CSVs.
The existing model supplies the feature schema and baseline for the experiment.
The script evaluates candidate configurations and does not automatically replace
the active model unless the separate holdout improvement gate passes.

No original dataset or notebook has been deleted or rewritten for this upload.
No synthetic customer data or substitute model is included.

## Checks

Checks that work from a clean clone after `npm ci`:

```sh
npm run lint
npm run build
npm run test:pages
node --test tests/actions.test.js tests/finance.test.js tests/navigation.test.js tests/risk-page.test.js tests/warranty.test.js
```

The full `npm test` suite additionally includes raw-data audit tests. Those need
the private CSVs listed in the audit. Python API and ML tests likewise require
local model/data artifacts; install `backend/requirements-dev.txt` first.
The feature tests also use the experimental
`Data/processed/service_cost_model.candidate.pkl` artifact when running the full
Python suite.

Git ignore rules prevent ordinary staging of environments, CSVs, notebook
outputs, credentials, model binaries, and build/cache outputs. Avoid `git add -f`
for those paths. Keep secrets in local `.env` files or the deployment environment.
