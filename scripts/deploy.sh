#!/bin/bash

set -e

echo "Pulling latest code..."
git pull origin main

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Running migrations..."
alembic upgrade head

echo "Restarting service..."
sudo systemctl restart tap2med

echo "Checking health..."
curl https://tap2med.com/health

echo
echo "Deployment successful."