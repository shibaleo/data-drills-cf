#!/usr/bin/env bash
# Usage: bash services/pdf/scripts/set-render-env.sh <RENDER_SERVICE_ID>
# Requires: RENDER_API_KEY env var
set -euo pipefail

ENV_FILE="$(dirname "$0")/../.env"
SERVICE_ID="${1:?Usage: $0 <RENDER_SERVICE_ID>}"

if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "Error: RENDER_API_KEY environment variable is not set" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found" >&2
  exit 1
fi

echo "Setting environment variables for service $SERVICE_ID ..."

# Read .env and set each variable via Render API
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # Trim whitespace
  key="$(echo "$key" | xargs)"
  value="$(echo "$value" | xargs)"

  echo "  Setting $key ..."
  curl -s -X PUT \
    "https://api.render.com/v1/services/${SERVICE_ID}/env-vars/${key}" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"value\": \"${value}\"}" \
    > /dev/null
done < "$ENV_FILE"

echo "Done!"
