# Repository setup

Plutus is an Integrated Automotive Warranty and Financing Management System. Its active workflows cover registered vehicles and loans, entered warranty policies, linked claims, staff decisions, portfolio, integrated review, reporting and follow-up notes. The model is one supporting feature. See [README.md](../README.md) for installation, execution, testing and deployment.

`Data/warranty_claims.csv` is the new supplied model-training dataset. The original raw training files and old service-cost binary have been retired; vehicle registration and financing no longer depend on them. `src/data/vehicleOptions.json` contains only static form defaults and component choices. Old aggregate JSON and legacy components remain as inactive source references, not live portfolio or credit records.

Run `python -m ml.train_claims_model` to create the active model from the supplied CSV, then start the backend and frontend. Existing account records stay in `Data/plutus.sqlite3` or the configured PostgreSQL database. Customer records are never inferred from or merged into the training CSV.

`npm run test:pages` covers all ten management and model routes. `npm run test:browser` exercises the integrated workflow using an isolated test database; follow the README instructions so disposable accounts are not created in your normal account database.
