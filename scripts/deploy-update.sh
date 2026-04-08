#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"
SERVICE_NAME="${SERVICE_NAME:-jiuzhuang-crm}"
SYSTEMCTL_BIN="${SYSTEMCTL_BIN:-systemctl}"
TARGET_REF="${1:-}"
APP_USER="${APP_USER:-}"
APP_GROUP="${APP_GROUP:-}"
RUN_DB_BACKUP="${RUN_DB_BACKUP:-0}"
RUN_RUNTIME_BACKUP="${RUN_RUNTIME_BACKUP:-0}"
RUN_MIGRATE_DEPLOY="${RUN_MIGRATE_DEPLOY:-0}"
DB_BACKUP_DIR="${DB_BACKUP_DIR:-$PROJECT_ROOT/backups/mysql}"
RUNTIME_BACKUP_DIR="${RUNTIME_BACKUP_DIR:-$PROJECT_ROOT/backups/runtime-assets}"

cd "$PROJECT_ROOT"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

mkdir -p "$PROJECT_ROOT/public/exports/shipping"
mkdir -p "$PROJECT_ROOT/public/uploads/avatars"

if [[ -n "$APP_USER" && -n "$APP_GROUP" ]]; then
  chown -R "$APP_USER:$APP_GROUP" \
    "$PROJECT_ROOT/public/exports" \
    "$PROJECT_ROOT/public/uploads"
fi

if [[ -n "$TARGET_REF" ]]; then
  git fetch --tags --prune origin
  git checkout "$TARGET_REF"
else
  git pull --ff-only
fi

if [[ "$RUN_DB_BACKUP" == "1" ]]; then
  echo "RUN_DB_BACKUP=1 detected. Creating MySQL backup."
  ENV_FILE="$ENV_FILE" BACKUP_DIR="$DB_BACKUP_DIR" bash "$PROJECT_ROOT/scripts/backup-mysql.sh"
fi

if [[ "$RUN_RUNTIME_BACKUP" == "1" ]]; then
  echo "RUN_RUNTIME_BACKUP=1 detected. Backing up runtime assets."
  BACKUP_DIR="$RUNTIME_BACKUP_DIR" bash "$PROJECT_ROOT/scripts/backup-runtime-assets.sh"
fi

npm ci
npx prisma validate

if [[ "$RUN_MIGRATE_DEPLOY" == "1" ]]; then
  echo "RUN_MIGRATE_DEPLOY=1 detected. Running prisma migrate deploy."
  npx prisma migrate deploy
fi

npx prisma generate

if [[ "${RUN_DB_PUSH:-0}" == "1" ]]; then
  echo "RUN_DB_PUSH=1 detected. Running prisma db push."
  npx prisma db push
fi

npm run build
"$SYSTEMCTL_BIN" restart "$SERVICE_NAME"
"$SYSTEMCTL_BIN" --no-pager --full status "$SERVICE_NAME"
