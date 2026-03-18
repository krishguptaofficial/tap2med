# Tap2Med

Healthcare infrastructure for Indian primary care.
Passive care event capture across clinics — zero friction,
zero cost, privacy-preserving by architecture.

## What this does
- Logs anonymous care events via QR scan
- Two-token hashing — personal data never stored
- Prescription capture with client-side PDF generation
- Consent layer for patient-controlled data sharing

## Tech stack
- Backend: Python FastAPI
- Database: PostgreSQL
- Migrations: Alembic
- Frontend: Vanilla HTML/JS

## Local setup
git clone https://github.com/krishguptaofficial/tap2med
cd tap2med
cp .env.example .env        # add your SECRET key here
docker-compose up           # starts postgres + fastapi
python -m pytest tests/     # run core tests first

## Environment variables
TAP2MED_SECRET=             # HMAC secret — never commit this
DATABASE_URL=               # postgres connection string

## Run tests before anything else
pytest tests/test_hashing.py
# These three tests must pass or nothing else matters

## Folder structure
app/core/hashing.py         # Core IP — read this first
app/api/                    # Route handlers
app/db/                     # Models and CRUD
frontend/patient/           # Patient facing pages
frontend/clinic/            # Doctor facing pages

## Core principle
Personal data never reaches our servers.
Ever.