#!/usr/bin/env bash
# scripts/run-tunnel.sh <port> <url_file>
set -euo pipefail

PORT="${1:?usage: run-tunnel.sh <port> <url_file>}"
URL_FILE="${2:?usage: run-tunnel.sh <port> <url_file>}"

rm -f "$URL_FILE"

# Trap termination signals to kill cloudflared cleanly
cleanup() {
  if [[ -n "${CF_PID:-}" ]]; then
    kill "$CF_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGTERM SIGINT

# Run cloudflared in a background coprocess or pipe
cloudflared tunnel --no-autoupdate --no-tls-verify --url "https://127.0.0.1:${PORT}" 2>&1 | while IFS= read -r line; do
  echo "$line"
  if [[ "$line" =~ (https://[a-zA-Z0-9-]+\.trycloudflare\.com) ]]; then
    echo "${BASH_REMATCH[1]}" > "$URL_FILE"
    echo "==> Tunnel URL saved to $URL_FILE: ${BASH_REMATCH[1]}"
  fi
done
