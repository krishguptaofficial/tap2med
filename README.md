# Tap2Med

> India-first healthcare infrastructure for OPD clinics.

Tap2Med is a privacy-first healthcare infrastructure platform designed to reduce operational friction inside Indian outpatient clinics.

Instead of replacing existing clinical workflows, Tap2Med simplifies them through a lightweight QR-based patient intake system, digital prescriptions, longitudinal patient history, and a backend designed for future interoperability.

The long-term vision is to become the infrastructure layer connecting clinics, laboratories, pharmacies, insurers, and national healthcare systems.

---

# Mission

Build the digital infrastructure layer powering India's fragmented outpatient healthcare ecosystem.

---

# Core Principles

- Workflow before software
- Speed before features
- Privacy by design
- Infrastructure over dashboards
- Mobile-first
- Clinic-first
- India-first

---

# Current Workflow

Patient scans clinic QR

↓

Patient joins queue

↓

Doctor writes digital prescription

↓

Prescription stored securely

↓

Patient receives digital prescription

↓

Visit history maintained

---

# Technology Stack

| Layer | Technology |
|--------|------------|
| Backend | FastAPI |
| Database | PostgreSQL 16 |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| Web Server | Nginx |
| Application Server | Gunicorn |
| Operating System | Ubuntu 24.04 LTS |
| SSL | Let's Encrypt |
| Deployment | VPS |
| Language | Python 3.12 |

---

# Features

- QR-based patient intake
- Digital prescriptions
- Visit timeline
- Longitudinal patient history
- Privacy-first identity architecture
- REST API
- HTTPS enabled
- Production deployment

---

# Project Structure

```
tap2med/
│
├── app/
├── alembic/
├── tests/
├── docs/
├── requirements.txt
├── README.md
└── .env.example
```

---

# Local Development

```bash
git clone <repository>

cd tap2med

python -m venv venv

source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

uvicorn app.main:app --reload
```

---

# Production Stack

```
Internet

↓

Nginx

↓

Gunicorn

↓

FastAPI

↓

PostgreSQL
```

---

# Documentation

Detailed documentation is available inside the `docs/` directory.

- Architecture
- Deployment
- Operations
- Security
- Database
- API
- Runbook
- Troubleshooting

---

# Status

Current Stage:

Production deployment completed.

Current Focus:

- Clinic onboarding
- Workflow optimization
- Product adoption

---

# License

Private project.