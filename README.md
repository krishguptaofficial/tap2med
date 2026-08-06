# Tap2Med

Tap2Med is an outpatient clinic workflow platform built for Indian healthcare.

The current focus is reducing operational friction inside independent clinics by providing a simple digital workflow for patient registration, prescriptions, and longitudinal visit history.

The long-term goal is to build infrastructure that connects clinics with the broader healthcare ecosystem without disrupting existing clinical workflows.

---

## Current Features

- QR-based patient registration
- Digital patient queue
- Digital prescriptions
- Patient visit history
- Production-ready REST API
- HTTPS-enabled deployment


## Technology Stack

| Component | Technology |
|----------|------------|
| Backend | FastAPI |
| Database | PostgreSQL 16 |
| ORM | SQLAlchemy |
| Database Migrations | Alembic |
| Application Server | Gunicorn |
| Reverse Proxy | Nginx |
| Operating System | Ubuntu 24.04 LTS |
| SSL | Let's Encrypt |

---

## Repository Structure

```
tap2med/
├── app/
├── alembic/
├── docs/
├── tests/
├── requirements.txt
├── README.md
└── .env.example
```

---

## Local Development

Clone the repository.

```bash
git clone <repository-url>
cd tap2med
```

Create a virtual environment.

```bash
python -m venv venv
```

Activate it.

Linux/macOS

```bash
source venv/bin/activate
```

Windows

```powershell
venv\Scripts\activate
```

Install dependencies.

```bash
pip install -r requirements.txt
```

Create an environment file.

```bash
cp .env.example .env
```

Update the values in `.env`.

Run the application.

```bash
uvicorn app.main:app --reload
```

Swagger UI:

```
http://127.0.0.1:8000/docs
```

---

## Production

Production deployment uses:

- Ubuntu VPS
- Nginx
- Gunicorn
- PostgreSQL
- systemd
- HTTPS (Let's Encrypt)

Deployment documentation is available in:

```
docs/DEPLOYMENT.md
```

---

## Documentation

| Document | Description |
|----------|-------------|
| ARCHITECTURE.md | System architecture |
| DEPLOYMENT.md | Production deployment |
| OPERATIONS.md | Operational procedures |
| DATABASE.md | Database administration |
| RUNBOOK.md | Incident response |
| SECURITY.md | Security posture |
| ADR.md | Architecture decision records |
| ROADMAP.md | Engineering roadmap |

---

## Project Status

Current stage:

Production deployment completed.

Current priority:

Clinic onboarding and workflow validation.

---

## License

Copyright (c) 2026 Tap2Med.

All Rights Reserved.

The source code, name, logo, and branding are proprietary unless explicitly stated otherwise.