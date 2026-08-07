#!/bin/bash

set -e

git pull origin main

source venv/bin/activate

pip install -r requirements.txt

alembic upgrade head

sudo systemctl restart tap2med

echo "Deployment complete."