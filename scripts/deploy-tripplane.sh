#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="/home/ubuntu/.nvm/versions/node/v22.22.3/bin/node"
export PATH="$(dirname "$NODE_BIN"):$PATH"
cd "$ROOT"
exec 8>"$ROOT/.runtime/publish.lock"
flock -n 8 || { echo 'Another publication is in progress'; exit 1; }
npm run typecheck
npm test
npm run build
sudo -n systemctl start shanhe-backup.service
sudo -n nginx -t
RELEASE="/var/www/shanhe/releases/$(date -u +%Y%m%dT%H%M%S)-$(sha256sum dist/index.html | cut -c1-12)"
PREVIOUS="$(readlink /var/www/shanhe/current || true)"
sudo -n install -d -m 755 "$RELEASE"
sudo -n cp -a dist/. "$RELEASE/"
sudo -n ln -sfn "$RELEASE" /var/www/shanhe/next
sudo -n mv -Tf /var/www/shanhe/next /var/www/shanhe/current
if ! sudo -n systemctl restart tripplane-api.service; then
  if [[ "$PREVIOUS" == /var/www/shanhe/releases/* ]]; then sudo -n ln -sfn "$PREVIOUS" /var/www/shanhe/current; fi
  echo 'API restart failed; previous frontend restored; inspect service logs' >&2
  exit 1
fi
for attempt in 1 2 3 4 5; do
  if curl --fail --silent --show-error --max-time 10 https://62.234.178.115/api/v1/health >/dev/null; then
    curl --fail --silent --show-error --max-time 10 https://62.234.178.115/ >/dev/null
    echo "Published $RELEASE at https://62.234.178.115/"
    exit 0
  fi
  sleep 2
done
if [[ "$PREVIOUS" == /var/www/shanhe/releases/* ]]; then sudo -n ln -sfn "$PREVIOUS" /var/www/shanhe/current; fi
echo 'Health check failed. Frontend reverted; private database was not overwritten.' >&2
exit 1
