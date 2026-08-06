# Operations

## Purpose

This document contains routine operational procedures for the production environment.

It does not describe deployment or architecture.

---

# Connect to Server

```bash
ssh krish@<SERVER_IP>
```

---

# Project Directory

```bash
cd ~/tap2med
```

---

# Activate Virtual Environment

```bash
source venv/bin/activate
```

---

# System Services

## Application

Status

```bash
sudo systemctl status tap2med
```

Start

```bash
sudo systemctl start tap2med
```

Stop

```bash
sudo systemctl stop tap2med
```

Restart

```bash
sudo systemctl restart tap2med
```

Reload systemd

```bash
sudo systemctl daemon-reload
```

---

## Nginx

Status

```bash
sudo systemctl status nginx
```

Restart

```bash
sudo systemctl restart nginx
```

Reload configuration

```bash
sudo systemctl reload nginx
```

Test configuration

```bash
sudo nginx -t
```

---

## PostgreSQL

Status

```bash
sudo systemctl status postgresql
```

Restart

```bash
sudo systemctl restart postgresql
```

---

# View Logs

## Application

Follow logs

```bash
journalctl -u tap2med -f
```

Last 100 lines

```bash
journalctl -u tap2med -n 100 --no-pager
```

---

## Nginx

Access log

```bash
sudo tail -f /var/log/nginx/access.log
```

Error log

```bash
sudo tail -f /var/log/nginx/error.log
```

---

## PostgreSQL

```bash
sudo journalctl -u postgresql -f
```

---

# Update Application

```bash
cd ~/tap2med

git pull origin main

source venv/bin/activate

pip install -r requirements.txt

alembic upgrade head

sudo systemctl restart tap2med
```

Verify

```bash
https://tap2med.com/health
```

---

# Database

Open PostgreSQL

```bash
sudo -u postgres psql
```

Connect

```sql
\c tap2med
```

List databases

```sql
\l
```

List tables

```sql
\dt
```

Exit

```sql
\q
```

---

# Resource Usage

CPU and Memory

```bash
htop
```

Disk

```bash
df -h
```

Directory sizes

```bash
du -sh *
```

Memory

```bash
free -h
```

---

# Network

Listening ports

```bash
sudo ss -tulpn
```

Application port

```bash
sudo ss -tulpn | grep 8000
```

---

# SSL

Certificate information

```bash
sudo certbot certificates
```

Renewal test

```bash
sudo certbot renew --dry-run
```

---

# Health Checks

Application

```
https://tap2med.com/health
```

Swagger

```
https://tap2med.com/docs
```

---

# Reboot Server

```bash
sudo reboot
```

After reboot verify

```bash
sudo systemctl status tap2med

sudo systemctl status nginx

sudo systemctl status postgresql
```

---

# Daily Checklist

- Application running
- Nginx running
- PostgreSQL running
- Health endpoint returns HTTP 200
- HTTPS certificate valid
- Disk usage below 80%
- Memory usage acceptable

---

# Weekly Checklist

- Apply system updates if scheduled
- Review application logs
- Review nginx error log
- Verify database backups
- Test SSL renewal
- Check available disk space

---

# Monthly Checklist

- Review installed packages
- Remove unused files
- Verify firewall configuration
- Verify SSH access
- Review database size
- Review VPS resource utilization