# Production Runbook

## Purpose

This document contains procedures for diagnosing and recovering production incidents.

Follow the procedures in order.

Do not skip verification steps.

---

# Incident Checklist

Before making changes:

- Identify the failing component.
- Check recent deployments.
- Read application logs.
- Verify system services.
- Confirm the issue is reproducible.

Do not restart services without identifying the failure.

---

# Service Status

Application

```bash
sudo systemctl status tap2med
```

Nginx

```bash
sudo systemctl status nginx
```

PostgreSQL

```bash
sudo systemctl status postgresql
```

---

# Health Check

```text
https://tap2med.com/health
```

Expected response:

```json
{"status":"ok"}
```

---

# If Application Is Down

Check service.

```bash
sudo systemctl status tap2med
```

Read logs.

```bash
journalctl -u tap2med -n 100 --no-pager
```

Restart only after reviewing logs.

```bash
sudo systemctl restart tap2med
```

Verify.

```bash
sudo systemctl status tap2med
```

---

# If Website Returns 502 Bad Gateway

Possible causes:

- Gunicorn stopped
- Gunicorn startup failure
- Incorrect Nginx configuration

Check:

```bash
sudo systemctl status tap2med
```

Check:

```bash
sudo nginx -t
```

Reload:

```bash
sudo systemctl reload nginx
```

---

# If Website Does Not Open

Check:

```bash
sudo systemctl status nginx
```

Verify configuration.

```bash
sudo nginx -t
```

Restart:

```bash
sudo systemctl restart nginx
```

---

# If HTTPS Stops Working

Check certificates.

```bash
sudo certbot certificates
```

Test renewal.

```bash
sudo certbot renew --dry-run
```

Reload nginx.

```bash
sudo systemctl reload nginx
```

---

# If Database Connection Fails

Verify PostgreSQL.

```bash
sudo systemctl status postgresql
```

Attempt connection.

```bash
sudo -u postgres psql
```

Verify application configuration.

```
.env
```

Verify:

```
DATABASE_URL
```

---

# If Migration Fails

Check current revision.

```bash
alembic current
```

View history.

```bash
alembic history
```

Never modify the production database manually to bypass migrations.

---

# If Deployment Fails

Return to previous commit.

```bash
git log
```

Checkout previous version.

```bash
git checkout <commit>
```

Restart application.

```bash
sudo systemctl restart tap2med
```

---

# Verify Production

Application

```bash
curl https://tap2med.com/health
```

Swagger

```text
https://tap2med.com/docs
```

Application status

```bash
sudo systemctl status tap2med
```

Nginx

```bash
sudo systemctl status nginx
```

Database

```bash
sudo systemctl status postgresql
```

---

# Disk Space

Check disk.

```bash
df -h
```

Largest directories.

```bash
du -sh * | sort -h
```

---

# Memory

```bash
free -h
```

Processes.

```bash
htop
```

---

# Network

Listening ports.

```bash
sudo ss -tulpn
```

Application.

```bash
sudo ss -tulpn | grep 8000
```

---

# Before Reboot

Verify:

- No active deployment
- No running migration
- No database restore
- No backup in progress

Reboot.

```bash
sudo reboot
```

---

# After Reboot

Verify:

```bash
sudo systemctl status tap2med
```

```bash
sudo systemctl status nginx
```

```bash
sudo systemctl status postgresql
```

Verify:

```
https://tap2med.com/health
```

---

# Escalation Order

1. Read logs.
2. Identify failing component.
3. Fix configuration.
4. Restart affected service.
5. Verify health endpoint.
6. Verify production website.
7. Document the incident.

---

# Post Incident

For every production incident record:

- Date
- Symptoms
- Root cause
- Resolution
- Preventive action

Add recurring issues to:

```
docs/TROUBLESHOOTING.md
```