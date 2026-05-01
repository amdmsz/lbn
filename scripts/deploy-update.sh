#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"
SERVICE_NAME="${SERVICE_NAME:-jiuzhuang-crm}"
WORKER_SERVICE_NAME="${WORKER_SERVICE_NAME:-jiuzhuang-crm-import-worker}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
TARGET_REF="${1:-}"
APP_USER="${APP_USER:-}"
APP_GROUP="${APP_GROUP:-}"
RUN_DB_BACKUP="${RUN_DB_BACKUP:-0}"
RUN_RUNTIME_BACKUP="${RUN_RUNTIME_BACKUP:-0}"
DB_BACKUP_DIR="${DB_BACKUP_DIR:-$PROJECT_ROOT/backups/mysql}"
RUNTIME_BACKUP_DIR="${RUNTIME_BACKUP_DIR:-$PROJECT_ROOT/backups/runtime-assets}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-}"

info() {
  echo "[deploy-update] $*"
}

fail() {
  echo "[deploy-update] ERROR: $*" >&2
  exit 1
}

assert_clean_worktree() {
  local status_output
  status_output="$(git status --short)"
  if [[ -n "$status_output" ]]; then
    echo "$status_output"
    fail "Git working tree is not clean."
  fi
}

cd "$PROJECT_ROOT"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

assert_clean_worktree

if [[ "${RUN_DB_PUSH:-0}" == "1" ]]; then
  fail "RUN_DB_PUSH is disabled in the hardened release pipeline. Use Prisma migrations or a manual reviewed operation."
fi

if [[ -n "${RUN_MIGRATE_DEPLOY:-}" ]]; then
  fail "RUN_MIGRATE_DEPLOY is deprecated. Prisma migrate deploy is now mandatory in deploy-update.sh and can no longer be skipped."
fi

mkdir -p "$PROJECT_ROOT/public/exports/shipping"
mkdir -p "$PROJECT_ROOT/public/downloads"
mkdir -p "$PROJECT_ROOT/public/uploads/avatars"
mkdir -p "$PROJECT_ROOT/runtime/imports/lead-imports"

if [[ -n "$APP_USER" && -n "$APP_GROUP" ]]; then
  chown -R "$APP_USER:$APP_GROUP" \
    "$PROJECT_ROOT/public/downloads" \
    "$PROJECT_ROOT/public/exports" \
    "$PROJECT_ROOT/public/uploads" \
    "$PROJECT_ROOT/runtime/imports"
fi

if [[ -n "$TARGET_REF" ]]; then
  git fetch --tags --prune origin
  git checkout "$TARGET_REF"
else
  git pull --ff-only
fi

assert_clean_worktree

if [[ "$RUN_DB_BACKUP" == "1" ]]; then
  info "RUN_DB_BACKUP=1 detected. Creating MySQL backup."
  ENV_FILE="$ENV_FILE" BACKUP_DIR="$DB_BACKUP_DIR" bash "$PROJECT_ROOT/scripts/backup-mysql.sh"
fi

if [[ "$RUN_RUNTIME_BACKUP" == "1" ]]; then
  info "RUN_RUNTIME_BACKUP=1 detected. Backing up runtime assets."
  BACKUP_DIR="$RUNTIME_BACKUP_DIR" bash "$PROJECT_ROOT/scripts/backup-runtime-assets.sh"
fi

info "Running release preflight gate."
ENV_FILE="$ENV_FILE" bash "$PROJECT_ROOT/scripts/release-preflight.sh"

if [[ ! -f "$PROJECT_ROOT/.next/BUILD_ID" ]]; then
  fail "Build completed without .next/BUILD_ID."
fi

info "Build gate passed. Running mandatory safe Prisma deploy sequence."
npm run prisma:deploy:safe -- --skip-generate

"$SYSTEMCTL_BIN" restart "$SERVICE_NAME"
"$SYSTEMCTL_BIN" --no-pager --full status "$SERVICE_NAME"

if [[ -n "$WORKER_SERVICE_NAME" ]]; then
  if "$SYSTEMCTL_BIN" status "$WORKER_SERVICE_NAME" >/dev/null 2>&1 || \
    "$SYSTEMCTL_BIN" is-enabled "$WORKER_SERVICE_NAME" >/dev/null 2>&1; then
    "$SYSTEMCTL_BIN" restart "$WORKER_SERVICE_NAME"
    "$SYSTEMCTL_BIN" --no-pager --full status "$WORKER_SERVICE_NAME"
  else
    echo "Worker service '$WORKER_SERVICE_NAME' not installed yet. Skipping worker restart."
  fi
fi

if [[ -n "$SMOKE_BASE_URL" ]]; then
  info "Running post-deploy smoke checks against $SMOKE_BASE_URL"
  bash "$PROJECT_ROOT/scripts/release-smoke.sh" "$SMOKE_BASE_URL"
else
  info "SMOKE_BASE_URL not set. Skipping post-deploy smoke script."
fi
