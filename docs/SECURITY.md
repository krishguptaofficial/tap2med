# Security

## Purpose

This document describes the current security posture of the Tap2Med production environment.

It also tracks planned security improvements.

---

# Infrastructure

Operating System

- Ubuntu 24.04 LTS

Web Server

- Nginx

Application Server

- Gunicorn

Database

- PostgreSQL 16

SSL

- Let's Encrypt

---

# Authentication

Application authentication is implemented at the application layer.

Authentication logic is not handled by Nginx or Gunicorn.

---

# Secrets

Secrets are loaded from:

```
.env
```

Secrets are never committed to Git.

The repository contains:

```
.env.example
```

with placeholder values only.

---

# TLS

TLS Provider

- Let's Encrypt

Certificate Management

- Certbot

Renewal

Automatic.

Verification

```bash
sudo certbot renew --dry-run
```

---

# Reverse Proxy

Internet traffic reaches only Nginx.

Gunicorn is bound to:

```
127.0.0.1:8000
```

Gunicorn is not publicly accessible.

---

# Database

Database access requires authentication.

Application database credentials are stored in:

```
.env
```

The production database is not exposed publicly.

---

# Linux

Application runs as:

```
krish
```

Application does not run as root.

---

# Current Security Controls

- HTTPS
- Environment variables
- Reverse proxy
- Gunicorn isolated behind Nginx
- Non-root application user
- Database authentication
- Version controlled migrations

---

# Planned Improvements

The following items have not yet been implemented.

## SSH

- SSH key authentication
- Disable password authentication
- Disable root SSH login

---

## Firewall

- Configure UFW
- Allow only:
    - SSH
    - HTTP
    - HTTPS

---

## Intrusion Prevention

- Install Fail2Ban
- Protect SSH

---

## HTTP Headers

Review:

- HSTS
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Content-Security-Policy

---

## Rate Limiting

Implement request rate limiting.

Review:

- Login endpoints
- Public endpoints
- API abuse

---

## Logging

Future improvements:

- Structured logs
- Security events
- Authentication failures

---

## Monitoring

Future improvements:

- Uptime monitoring
- Disk alerts
- Memory alerts
- Certificate expiration alerts

---

# Secrets Policy

Never commit:

- .env
- Private keys
- API keys
- Database passwords
- SSH keys
- Tokens

Never send secrets over email or chat.

Rotate secrets if compromise is suspected.

---

# Dependency Management

Before production deployment:

```bash
pip install -r requirements.txt
```

Keep dependencies updated after compatibility testing.

Avoid unpinned production dependencies.

---

# Security Review

Review after:

- New authentication features
- Infrastructure changes
- Major dependency upgrades
- Public API changes

---

# Related Documents

Deployment

```
docs/DEPLOYMENT.md
```

Operations

```
docs/OPERATIONS.md
```

Runbook

```
docs/RUNBOOK.md
```