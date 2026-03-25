# Tap2Med: Healthcare Infrastructure Wedge (v0)

Tap2Med is a resilient, privacy-first infrastructure layer for Indian OPD clinics. 
It replaces messy paper queues with an anonymized digital flow.

## The Core Philosophy
* **Zero PII Storage:** Phone numbers are shredded (HMAC) before hitting the DB.
* **Clinic Silos:** Strict data isolation using clinic-specific salts.
* **The Ghost Token:** Two-token event system (Local for Clinic, Network for Journey).
* **Boring Tech:** FastAPI, PostgreSQL, and Vanilla JS for 99.9% uptime on weak 3G.