# Tap2Med: Healthcare Infrastructure Wedge (v0)

Tap2Med is a resilient, privacy-first infrastructure layer for Indian OPD clinics. 
It replaces messy paper queues with an anonymized digital flow.

## The Core Philosophy
* **Zero PII Storage:** Phone numbers are shredded (HMAC) before hitting the DB.
* **Clinic Silos:** Strict data isolation using clinic-specific salts.
* **The Ghost Token:** Two-token event system (Local for Clinic, Network for Journey).
* **Boring Tech:** FastAPI, PostgreSQL, and Vanilla JS for 99.9% uptime on weak 3G.

## Technical Structure
- `app/api`: Role-based endpoints (Reception, Doctor, Patient).
- `app/core`: The "Shredder" (Hashing) and Security logic.
- `app/db`: PostgreSQL schemas with zero "Phone" columns.
- `frontend/`: Lightweight, responsive Vanilla HTML/JS (PC & Mobile support).

## The Shredder Flow
1. Patient Scans QR → Enters Phone.
2. Backend generates `local_token` = HMAC(Phone, Secret + Clinic_Salt).
3. Phone is discarded from memory.
4. `local_token` is the only identifier visible to clinic staff.