#!/usr/bin/env bash
# Set CF Workers secrets from .env file
# Usage: bash scripts/set-cf-secrets.sh

set -euo pipefail

ENV_FILE=".env"
WORKER_NAME="data-drills-cf"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

echo "Setting secrets for worker=$WORKER_NAME"
echo ""

while IFS= read -r line || [ -n "$line" ]; do
  # Strip Windows CR
  line="${line//$'\r'/}"

  # Skip empty lines and comments
  [[ -z "$line" || "$line" =~ ^# ]] && continue

  KEY="${line%%=*}"
  VALUE="${line#*=}"

  # Skip VITE_ vars except VITE_CLERK_PUBLISHABLE_KEY (needed at runtime for JWT verification)
  if [[ "$KEY" == VITE_* && "$KEY" != "VITE_CLERK_PUBLISHABLE_KEY" ]]; then
    echo "⏭ Skipping $KEY (client-side only, baked into build)"
    continue
  fi

  echo "Setting $KEY..."
  echo "$VALUE" | npx wrangler secret put "$KEY" --name "$WORKER_NAME"
done < "$ENV_FILE"

echo ""
echo "Done!"
