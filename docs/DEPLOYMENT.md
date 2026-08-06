# Production Deployment

## Purpose

This document describes the current production deployment of Tap2Med.

Update this document whenever production infrastructure changes.

---

# Production Environment

| Component | Value |
|-----------|-------|
| Operating System | Ubuntu 24.04 LTS |
| Web Server | Nginx |
| Application Server | Gunicorn |
| Framework | FastAPI |
| Database | PostgreSQL 16 |
| Process Manager | systemd |
| SSL | Let's Encrypt |

---

# Repository

```
/home/krish/tap2med
```

---

# Deployment User

Application processes run as:

```
krish
```

The application is not deployed as root.

---

# Application Directory

```
/home/krish/tap2med
```

---

# Python Environment

Virtual environment:

```
venv/
```

Activate:

```bash
source venv/bin/activate
```

---

# Production Services

Application:

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

# Deployment Procedure

## 1. Connect

```bash
ssh krish@<SERVER_IP>
```

---

## 2. Go to project

```bash
cd ~/tap2med
```

---

## 3. Activate virtual environment

```bash
source venv/bin/activate
```

---

## 4. Pull latest code

```bash
git pull origin main
```

---

## 5. Install dependencies

```bash
pip install -r requirements.txt
```

Only required if dependencies changed.

---

## 6. Run database migrations

```bash
alembic upgrade head
```

---

## 7. Restart application

```bash
sudo systemctl restart tap2med
```

---

## 8. Verify service

```bash
sudo systemctl status tap2med
```

Expected:

```
active (running)
```

---

## 9. Verify Nginx

```bash
sudo systemctl status nginx
```

---

## 10. Verify API

```
https://tap2med.com/health
```

Expected:

```json
{"status":"ok"}
```

---

# Application Logs

Last 100 lines:

```bash
journalctl -u tap2med -n 100 --no-pager
```

Follow logs:

```bash
journalctl -u tap2med -f
```

---

# Nginx Logs

Access log:

```bash
sudo tail -f /var/log/nginx/access.log
```

Error log:

```bash
sudo tail -f /var/log/nginx/error.log
```

---

# PostgreSQL

Open shell:

```bash
sudo -u postgres psql
```

Connect:

```sql
\c tap2med
```

---

# SSL

Current provider:

```
Let's Encrypt
```

Renewal test:

```bash
sudo certbot renew --dry-run
```

---

# Service Files

Gunicorn service:

```
/etc/systemd/system/tap2med.service
```

Nginx configuration:

```
/etc/nginx/sites-available/tap2med
```

Enabled site:

```
/etc/nginx/sites-enabled/tap2med
```

---

# Configuration Files

Application:

```
.env
```

Example:

```
.env.example
```

The production `.env` file is never committed.

---

# Rollback

If deployment fails:

1. Restore previous commit.

```bash
git checkout <commit>
```

2. Reinstall dependencies if required.

```bash
pip install -r requirements.txt
```

3. Re-run migrations if applicable.

4. Restart service.

```bash
sudo systemctl restart tap2med
```

---

# Post Deployment Checklist

- Health endpoint returns 200
- Swagger loads
- Nginx running
- Gunicorn running
- PostgreSQL running
- HTTPS certificate valid

Deployment is complete only after all checks pass.