#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: ./restore_db.sh <backup.sql>"
    exit 1
fi

psql -U db_admin tap2med < "$1"

echo "Database restored."