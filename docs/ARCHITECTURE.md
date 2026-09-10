# Architecture

## Purpose

This document describes the production architecture of Tap2Med.

It covers:

- System components
- Request flow
- Deployment topology
- Technology choices
- Scaling strategy

It does not describe business logic or product features.

---

# Production Topology

```
                    Internet
                        │
                        ▼
                 HTTPS (443)
                        │
                        ▼
                     Nginx
                        │
                        ▼
              127.0.0.1:8000
                        │
                        ▼
                   Gunicorn
                 (2 Workers)
                        │
                        ▼
                    FastAPI
                        │
                        ▼
                 SQLAlchemy
                        │
                        ▼
                  PostgreSQL
```

---

# Components

## Ubuntu

Hosts every production component.

Responsibilities:

- systemd
- Nginx
- Gunicorn
- PostgreSQL
- FastAPI

---

## Nginx

Responsibilities:

- TLS termination
- Reverse proxy
- HTTP → HTTPS redirect
- Forward requests to Gunicorn

Public ports:

- 80
- 443

---

## Gunicorn

Responsibilities:

- Process management
- Worker management
- Serve FastAPI

Configuration:

- 2 workers
- UvicornWorker
- Bound to 127.0.0.1:8000

Gunicorn is never exposed directly to the internet.

---

## FastAPI

Responsibilities:

- Routing
- Validation
- Business logic
- JSON responses

---

## SQLAlchemy

Responsibilities:

- ORM
- Database sessions
- Query execution

---

## PostgreSQL

Primary datastore.

Stores:

- Clinics
- Patients
- Events
- Prescriptions
- Reports

---

# Request Flow

```
Browser

↓

HTTPS Request

↓

Nginx

↓

Gunicorn

↓

FastAPI

↓

SQLAlchemy

↓

PostgreSQL

↓

JSON Response
```

---

# Directory Structure

```
tap2med/

app/
alembic/
tests/
docs/

requirements.txt
README.md
```

---

# Deployment

Current deployment consists of a single VPS.

No containers.

No load balancer.

No external cache.

This minimizes operational complexity.

---

# Configuration

Application configuration is loaded from:

```
.env
```

Production secrets are never committed.

Example configuration is stored in:

```
.env.example
```

---

# Database Migrations

Schema changes are managed with Alembic.

Production migrations are executed manually during deployment.

---

# Logging

Current logging:

- Gunicorn
- Nginx
- FastAPI

Future:

- Structured logging
- Centralized log aggregation

---

# Monitoring

Current monitoring:

- systemd service status
- Nginx status
- PostgreSQL status
- Health endpoint

Future:

- Metrics
- Alerting
- Uptime monitoring

---

# Scaling Strategy

Current architecture supports vertical scaling.

Upgrade order:

1. Larger VPS
2. Separate PostgreSQL server
3. Multiple application servers
4. Load balancer

Horizontal scaling will only be introduced when required by production traffic.

---

# Related Documents

Deployment:

docs/DEPLOYMENT.md

Operations:

docs/OPERATIONS.md

Database:

docs/DATABASE.md

Security:

docs/SECURITY.md