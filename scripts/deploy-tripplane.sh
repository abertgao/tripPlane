#!/usr/bin/env bash
# 构建 main 并在 8802 发布静态页面
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${TRIPPLANE_NODE_BIN:-/home/ubuntu/.nvm/versions/node/v22.22.3/bin/node}"
NPM_BIN="${TRIPPLANE_NPM_BIN:-$(dirname "$NODE_BIN")/npm}"
VITE_BIN="$ROOT/node_modules/vite/bin/vite.js"

export PATH="$(dirname "$NODE_BIN"):$PATH"
cd "$ROOT"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "error: node not found at $NODE_BIN" >&2
  exit 1
fi

LOCK_HASH_FILE="$ROOT/.deploy-lockhash"
NEW_HASH="$(git -C "$ROOT" rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"
OLD_HASH="$(cat "$LOCK_HASH_FILE" 2>/dev/null || true)"
if [[ ! -d "$ROOT/node_modules" || "$NEW_HASH" != "$OLD_HASH" ]]; then
  if [[ -f "$ROOT/package-lock.json" ]]; then
    "$NPM_BIN" ci
  else
    "$NPM_BIN" install
  fi
  printf "%s\n" "$NEW_HASH" > "$LOCK_HASH_FILE"
fi

"$NPM_BIN" run build
if [[ ! -f "$VITE_BIN" ]]; then
  echo "error: vite is not installed" >&2
  exit 1
fi

if [[ ! -s "$ROOT/.webhook-secret" ]]; then
  openssl rand -hex 32 > "$ROOT/.webhook-secret"
  chmod 600 "$ROOT/.webhook-secret"
fi

sudo cp "$ROOT/deploy/tripplane.service" /etc/systemd/system/tripplane.service
sudo cp "$ROOT/deploy/tripplane-webhook.service" /etc/systemd/system/tripplane-webhook.service
sudo systemctl daemon-reload
sudo systemctl disable --now tripplane-pull-deploy.timer 2>/dev/null || true
sudo systemctl enable tripplane.service
sudo systemctl enable tripplane-webhook.service

sudo systemctl stop tripplane.service || true
for pid in $(pgrep -u "$(id -un)" -f "$ROOT/node_modules/vite/bin/vite.js" || true); do
  cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
  if [[ "$cwd" == "$ROOT" ]]; then
    kill "$pid" 2>/dev/null || true
  fi
done
for pid in $(ss -lptn 'sport = :8802' | sed -n 's/.*pid=\([0-9]*\).*/\1/p'); do
  cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
  if [[ "$cwd" == "$ROOT" ]]; then
    kill "$pid" 2>/dev/null || true
  fi
done
sleep 1
sudo systemctl restart tripplane-webhook.service
sudo systemctl start tripplane.service

sudo cp "$ROOT/deploy/nginx-tripplane.conf" /etc/nginx/sites-available/tripplane
sudo ln -sfn /etc/nginx/sites-available/tripplane /etc/nginx/sites-enabled/tripplane
sudo nginx -t
sudo systemctl reload nginx

echo "---- tripplane status ----"
sudo systemctl is-active tripplane.service
sudo systemctl is-active tripplane-webhook.service
curl -s -o /dev/null -w "http:%{http_code}\n" http://127.0.0.1:8802/ || true
