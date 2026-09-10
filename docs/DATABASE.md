# Database

## Purpose

This document describes the PostgreSQL database used by Tap2Med.

It covers administration, migrations, backups, and operational procedures.

Database schema is defined in SQLAlchemy models and Alembic migrations.

---

# Database Engine

| Property | Value |
|----------|-------|
| Engine | PostgreSQL |
| Version | 16 |
| ORM | SQLAlchemy |
| Migration Tool | Alembic |

---

# Database Name

```
tap2med
```

---

# Database User

Production application:

```
db_admin
```

---

# Connect

As postgres:

```bash
sudo -u postgres psql
```

Connect to Tap2Med:

```sql
\c tap2med
```

Exit:

```sql
\q
```

---

# Common Commands

List databases

```sql
\l
```

List users

```sql
\du
```

List tables

```sql
\dt
```

Describe table

```sql
\d table_name
```

Current connections

```sql
SELECT * FROM pg_stat_activity;
```

---

# Alembic

Current version

```bash
alembic current
```

Migration history

```bash
alembic history
```

Create migration

```bash
alembic revision --autogenerate -m "description"
```

Apply migrations

```bash
alembic upgrade head
```

Downgrade one revision

```bash
alembic downgrade -1
```

---

# Backup

Create backup

```bash
pg_dump -U db_admin tap2med > backup.sql
```

Restore backup

```bash
psql -U db_admin tap2med < backup.sql
```

Backup procedures are documented in:

```
docs/BACKUPS.md
```

---

# Connection String

Loaded from:

```
.env
```

Never hardcode database credentials.

---

# Maintenance

Recommended:

- Monitor disk usage
- Monitor active connections
- Review slow queries
- Vacuum and analyze (handled by PostgreSQL autovacuum)

---

# Operational Rules

- Never edit production data manually unless necessary.
- Never modify schema directly with SQL.
- All schema changes must go through Alembic.
- Always verify migrations locally before production deployment.

---

# Monitoring

Useful query:

```sql
SELECT count(*) FROM pg_stat_activity;
```

Database size:

```sql
SELECT pg_size_pretty(pg_database_size('tap2med'));
```

Largest tables:

```sql
SELECT
    relname,
    pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

---

# Performance

Before optimizing:

- Measure query execution time.
- Verify indexes.
- Review execution plans.

Do not add indexes without evidence.

---

# References

Application configuration:

```
app/database.py
```

Models:

```
app/models.py
```

Migrations:

```
alembic/
```