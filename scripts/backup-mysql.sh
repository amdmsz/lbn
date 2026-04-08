#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups/mysql}"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required. Set it in ENV_FILE or the current shell." >&2
  exit 1
fi

if ! command -v mysqldump >/dev/null 2>&1; then
  echo "mysqldump is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed or not in PATH." >&2
  exit 1
fi

mapfile -t DB_PARTS < <(
  node - <<'NODE'
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const parsed = new URL(databaseUrl);
const values = [
  parsed.hostname || "127.0.0.1",
  parsed.port || "3306",
  decodeURIComponent(parsed.username || ""),
  decodeURIComponent(parsed.password || ""),
  parsed.pathname.replace(/^\/+/, ""),
];

for (const value of values) {
  console.log(value);
}
NODE
)

DB_HOST="${DB_PARTS[0]:-}"
DB_PORT="${DB_PARTS[1]:-3306}"
DB_USER="${DB_PARTS[2]:-}"
DB_PASSWORD="${DB_PARTS[3]:-}"
DB_NAME="${DB_PARTS[4]:-}"

if [[ -z "$DB_HOST" || -z "$DB_USER" || -z "$DB_NAME" ]]; then
  echo "Failed to parse DATABASE_URL into host/user/database." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

OUTPUT_FILE="$BACKUP_DIR/mysql-${DB_NAME}-${TIMESTAMP}.sql.gz"

MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  "$DB_NAME" | gzip > "$OUTPUT_FILE"

echo "MySQL backup created: $OUTPUT_FILE"
