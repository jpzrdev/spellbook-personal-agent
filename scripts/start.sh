#!/usr/bin/env bash
# Sobe o Bridge e o HUD juntos (macOS/Linux/Git Bash). Ctrl+C encerra os dois.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$root/.env" ]; then
  token="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))' 2>/dev/null || python -c 'import secrets; print(secrets.token_urlsafe(32))')"
  sed "s/^BRIDGE_TOKEN=$/BRIDGE_TOKEN=$token/" "$root/.env.example" > "$root/.env"
  echo ".env criado a partir do .env.example (token gerado)."
fi

(cd "$root/bridge" && uv run python -m app.setup_vault)
[ -d "$root/hud/node_modules" ] || (cd "$root/hud" && npm install)

(cd "$root/bridge" && uv run python -m app.main) &
bridge_pid=$!
trap 'kill $bridge_pid 2>/dev/null' EXIT
cd "$root/hud" && npm run dev
