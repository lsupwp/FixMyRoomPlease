#!/usr/bin/env bash
# Setup Node.js 20 + npm install for Ubuntu (for Docker build that copies node_modules from host)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Installing Node.js + npm (Ubuntu/Debian)..."
if ! command -v node &>/dev/null; then
  sudo apt update
  sudo apt install nodejs npm -y
fi

echo "==> Node $(node -v) | npm $(npm -v)"

echo "==> Installing dependencies in web/..."
cd web
npm install
npx tailwindcss -i public/css/input.css -o public/css/style.css --minify
cd ..

echo "==> Done. You can now run: sudo docker compose -f compose.prod.yml up -d --build"
