#!/usr/bin/env bash
# Install dependencies and initialize a fresh Crypto Signal Dashboard database.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/public_html/backend"
ENV_FILE="$PROJECT_ROOT/private/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

for command in node npm mariadb; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

if [ ! -f "$ENV_FILE" ]; then
  mkdir -p "$PROJECT_ROOT/private"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE. Configure DB_* and PROJECT_API_SECRET, then run this script again." >&2
  exit 1
fi

required_vars=(DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD PROJECT_API_SECRET)
for variable in "${required_vars[@]}"; do
  if ! grep -qE "^${variable}=.+" "$ENV_FILE"; then
    echo "Missing required setting ${variable} in $ENV_FILE" >&2
    exit 1
  fi
done

env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

DB_HOST="$(env_value DB_HOST)"
DB_PORT="$(env_value DB_PORT)"
DB_NAME="$(env_value DB_NAME)"
DB_USER="$(env_value DB_USER)"
DB_PASSWORD="$(env_value DB_PASSWORD)"

echo "Installing backend dependencies..."
npm ci --prefix "$BACKEND_DIR" --omit=dev

echo "Initializing the database schema..."
(cd "$PROJECT_ROOT" && mariadb \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password="$DB_PASSWORD" \
  --database="$DB_NAME" < "$PROJECT_ROOT/install.sql")

echo "Installation complete. Start with: node $BACKEND_DIR/src/server.js"
