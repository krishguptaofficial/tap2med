# Installation Guide

## Purpose

This document describes how to deploy Tap2Med on a fresh Ubuntu 24.04 LTS server.

It assumes:

- A clean Ubuntu VPS
- A registered domain
- A GitHub repository
- Basic Linux knowledge

---

# System Requirements

| Component | Version |
|-----------|---------|
| Ubuntu | 24.04 LTS |
| Python | 3.12+ |
| PostgreSQL | 16 |
| Nginx | Latest |
| Git | Latest |

---

# 1. Update System

```bash
sudo apt update
sudo apt upgrade -y
```

---

# 2. Install Dependencies

```bash
sudo apt install \
python3 \
python3-pip \
python3-venv \
postgresql \
postgresql-contrib \
nginx \
git \
certbot \
python3-certbot-nginx \
build-essential \
libpq-dev -y
```

---

# 3. Clone Repository

```bash
git clone <repository-url>

cd tap2med
```

---

# 4. Create Virtual Environment

```bash
python3 -m venv venv

source venv/bin/activate
```

---

# 5. Install Python Packages

```bash
pip install -r requirements.txt
```

---

# 6. Configure Environment

Copy:

```bash
cp .env.example .env
```

Update:

```
DATABASE_URL

SECRET_KEY

APP_NAME

ENVIRONMENT
```

with production values.

---

# 7. Configure PostgreSQL

Create:

- Database
- Database user

Grant required permissions.

Update:

```
DATABASE_URL
```

inside `.env`.

---

# 8. Apply Database Migrations

```bash
alembic upgrade head
```

---

# 9. Install systemd Service

```bash
sudo cp deploy/systemd/tap2med.service \
/etc/systemd/system/
```

Reload:

```bash
sudo systemctl daemon-reload
```

Enable:

```bash
sudo systemctl enable tap2med
```

Start:

```bash
sudo systemctl start tap2med
```

Verify:

```bash
sudo systemctl status tap2med
```

Expected:

```
active (running)
```

---

# 10. Install Nginx Configuration

```bash
sudo cp deploy/nginx/tap2med.conf \
/etc/nginx/sites-available/tap2med
```

Enable:

```bash
sudo ln -sf \
/etc/nginx/sites-available/tap2med \
/etc/nginx/sites-enabled/tap2med
```

Test:

```bash
sudo nginx -t
```

Reload:

```bash
sudo systemctl reload nginx
```

---

# 11. Configure DNS

Point the domain's A record to the VPS IP address.

Wait for DNS propagation.

Verify:

```bash
ping tap2med.com
```

---

# 12. Install HTTPS

```bash
sudo certbot --nginx \
-d tap2med.com \
-d www.tap2med.com
```

Verify:

```
https://tap2med.com
```

---

# 13. Verify Deployment

Application:

```
https://tap2med.com/health
```

Swagger:

```
https://tap2med.com/docs
```

Systemd:

```bash
sudo systemctl status tap2med
```

Nginx:

```bash
sudo systemctl status nginx
```

PostgreSQL:

```bash
sudo systemctl status postgresql
```

---

# Restore Configuration

Nginx

```bash
sudo cp deploy/nginx/tap2med.conf \
/etc/nginx/sites-available/tap2med
```

systemd

```bash
sudo cp deploy/systemd/tap2med.service \
/etc/systemd/system/
```

Reload:

```bash
sudo systemctl daemon-reload

sudo systemctl restart tap2med

sudo systemctl reload nginx
```

---

# Related Documents

- docs/DEPLOYMENT.md
- docs/RUNBOOK.md
- docs/OPERATIONS.md
- docs/SECURITY.md