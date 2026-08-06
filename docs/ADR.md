# Architecture Decision Record (ADR)

## Purpose

This document records significant engineering decisions made during the development of Tap2Med.

Each record documents:

- Decision
- Context
- Alternatives considered
- Reasoning
- Consequences

Once accepted, a decision should not be modified.

If requirements change, create a new ADR instead of rewriting history.

---

# ADR-001

## Title

Choose FastAPI as the backend framework.

### Status

Accepted

### Date

2026-08-07

### Context

Tap2Med is an API-first application with minimal server-side rendering.

The project requires:

- Request validation
- Automatic OpenAPI documentation
- Type hints
- High developer productivity

### Alternatives Considered

- Django
- Flask

### Decision

Use FastAPI.

### Reason

FastAPI provides:

- Native type validation
- Automatic API documentation
- Async support
- Good performance
- Simple project structure

### Consequences

Future components should follow FastAPI conventions.

---

# ADR-002

## Title

Use PostgreSQL as the primary database.

### Status

Accepted

### Date

2026-08-07

### Context

Tap2Med stores transactional healthcare data.

Requirements:

- ACID transactions
- Strong consistency
- Mature tooling
- Reliable backups

### Alternatives Considered

- MySQL
- SQLite
- MongoDB

### Decision

Use PostgreSQL.

### Reason

PostgreSQL provides:

- Strong transactional guarantees
- Excellent indexing
- JSON support
- Mature ecosystem
- Reliable backup and recovery

### Consequences

Application models are designed around relational data.

---

# ADR-003

## Title

Use SQLAlchemy as the ORM.

### Status

Accepted

### Date

2026-08-07

### Context

The application requires an ORM compatible with FastAPI and PostgreSQL.

### Alternatives Considered

- Raw SQL
- Django ORM
- Tortoise ORM

### Decision

Use SQLAlchemy.

### Reason

- Mature ecosystem
- Excellent PostgreSQL support
- Alembic integration
- Strong community adoption

---

# ADR-004

## Title

Use Alembic for schema migrations.

### Status

Accepted

### Date

2026-08-07

### Decision

All schema changes are managed through Alembic.

### Reason

Schema history remains version controlled.

Production changes are reproducible.

---

# ADR-005

## Title

Deploy on a single Ubuntu VPS.

### Status

Accepted

### Date

2026-08-07

### Context

Tap2Med is maintained by a solo founder.

### Alternatives Considered

- Kubernetes
- Docker Swarm
- Managed PaaS

### Decision

Deploy directly on Ubuntu.

### Reason

Lower operational complexity.

Lower cost.

Simpler debugging.

### Consequences

Scaling initially occurs through larger VPS instances.

---

# ADR-006

## Title

Use Gunicorn behind Nginx.

### Status

Accepted

### Date

2026-08-07

### Context

FastAPI should not be directly exposed to the internet.

### Alternatives Considered

- Uvicorn directly
- Hypercorn

### Decision

Gunicorn + Nginx

### Reason

- Mature production deployment
- Reverse proxy support
- Process management
- TLS termination through Nginx

---

# ADR-007

## Title

Manage Gunicorn with systemd.

### Status

Accepted

### Date

2026-08-07

### Decision

Use systemd.

### Reason

Provides:

- Automatic restart
- Startup on boot
- Centralized logging
- Native Ubuntu integration

---

# ADR-008

## Title

Use Let's Encrypt for TLS certificates.

### Status

Accepted

### Date

2026-08-07

### Decision

Use Certbot with Let's Encrypt.

### Reason

- Free certificates
- Automatic renewal
- Native Nginx integration

---

# ADR-009

## Title

Store configuration in environment variables.

### Status

Accepted

### Date

2026-08-07

### Decision

Application configuration is loaded from `.env`.

### Reason

Prevents secrets from being committed to version control.

Supports different environments.

---

# ADR-010

## Title

Avoid unnecessary infrastructure complexity.

### Status

Accepted

### Date

2026-08-07

### Context

Tap2Med is in its early stages.

### Decision

Do not introduce infrastructure solely for future scale.

### Examples

Current exclusions:

- Kubernetes
- Redis
- RabbitMQ
- Kafka
- Microservices

These technologies will only be introduced after measurable production requirements justify them.

---

# Rules

1. Do not edit accepted ADRs.

2. Create a new ADR when a previous decision changes.

3. Reference ADR numbers in pull requests when applicable.

4. Every significant infrastructure decision should have an ADR.