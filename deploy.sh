#!/bin/bash
set -e

echo "Pulling latest changes..."
git pull origin main

echo "Building and starting containers..."
docker compose pull 2>/dev/null || true
docker compose up -d --build

echo "Removing unused images..."
docker image prune -f

echo "Done. Launchpad running at http://$(hostname -I | awk '{print $1}'):3001"
