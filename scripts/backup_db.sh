#!/bin/bash

mkdir -p backups

pg_dump -U db_admin tap2med > backups/tap2med_$(date +%F_%H-%M-%S).sql

echo "Database backup created."