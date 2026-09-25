#!/usr/bin/env bash
# 由 GitHub push hook 调用：拉取 main 或 master，有更新才构建并发布到 8802。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${TRIPPLANE_DEPLOY_BRANCH:-main}"
REMOTE="${TRIPPLANE_DEPLOY_REMOTE:-origin}"
LOCK_FILE="${TRIPPLANE_DEPLOY_LOCK:-/tmp/tripplane-pull-deploy.lock}"
LOG_PREFIX="[tripplane-deploy]"

cd "$ROOT"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "$LOG_PREFIX another deploy is running, skip"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "$LOG_PREFIX skip: $ROOT has uncommitted changes"
  exit 0
fi

git fetch --prune "$REMOTE" "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "$REMOTE/$BRANCH")"

if [[ "$LOCAL" == "$REMOTE_SHA" ]]; then
  echo "$LOG_PREFIX already up to date ($(git rev-parse --short HEAD))"
  exit 0
fi

AHEAD="$(git rev-list --count "$REMOTE/$BRANCH"..HEAD 2>/dev/null || echo 0)"
BEHIND="$(git rev-list --count HEAD.."$REMOTE/$BRANCH" 2>/dev/null || echo 0)"

if [[ "${AHEAD:-0}" -gt 0 ]]; then
  echo "$LOG_PREFIX skip: local is $AHEAD commit(s) ahead of $REMOTE/$BRANCH"
  exit 0
fi

if [[ "${BEHIND:-0}" -eq 0 ]]; then
  echo "$LOG_PREFIX skip: histories diverged"
  exit 0
fi

echo "$LOG_PREFIX updating $(git rev-parse --short "$LOCAL") → $(git rev-parse --short "$REMOTE_SHA") (behind $BEHIND)"
git reset --hard "$REMOTE/$BRANCH"
bash "$ROOT/scripts/deploy-tripplane.sh"
echo "$LOG_PREFIX done at $(date -Iseconds) → $(git rev-parse --short HEAD)"
