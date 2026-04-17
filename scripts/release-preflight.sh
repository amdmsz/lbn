#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"
ALLOW_PENDING_MIGRATIONS="${ALLOW_PENDING_MIGRATIONS:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
REQUIRE_REDIS="${REQUIRE_REDIS:-1}"
REQUIRE_CLEAN_WORKTREE="${REQUIRE_CLEAN_WORKTREE:-1}"

cd "$PROJECT_ROOT"

info() {
  echo "[release-preflight] $*"
}

fail() {
  echo "[release-preflight] ERROR: $*" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

assert_clean_worktree() {
  local status_output
  status_output="$(git status --short)"
  if [[ -n "$status_output" ]]; then
    echo "$status_output"
    fail "Git working tree is not clean."
  fi
}

require_command git
require_command node
require_command npm
require_command npx

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Current directory is not a Git worktree."

if [[ "$REQUIRE_CLEAN_WORKTREE" == "1" ]]; then
  assert_clean_worktree
fi

if [[ ! -f "$ENV_FILE" ]]; then
  fail "ENV_FILE does not exist: $ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

for required_var in DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET; do
  if [[ -z "${!required_var:-}" ]]; then
    fail "$required_var is required."
  fi
done

if [[ "${NODE_ENV:-}" != "production" ]]; then
  fail "NODE_ENV must be production for release preflight."
fi

if [[ "$REQUIRE_REDIS" == "1" && -z "${REDIS_URL:-}" ]]; then
  fail "REDIS_URL is required for the lead import worker baseline."
fi

info "Running prisma validate."
npx prisma validate

info "Checking prisma migrate status."
migrate_status_output="$(npx prisma migrate status 2>&1)" || {
  printf '%s\n' "$migrate_status_output"
  fail "prisma migrate status failed."
}
printf '%s\n' "$migrate_status_output"

if grep -Fq "failed migrations" <<<"$migrate_status_output"; then
  fail "Detected failed migrations in the target database."
fi

if grep -Fq "not yet been applied" <<<"$migrate_status_output" && [[ "$ALLOW_PENDING_MIGRATIONS" != "1" ]]; then
  fail "Detected pending migrations. Run deploy with RUN_MIGRATE_DEPLOY=1 or apply migrations manually first."
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  info "Running production build."
  npm run build

  if [[ ! -f "$PROJECT_ROOT/.next/BUILD_ID" ]]; then
    fail "Build completed without .next/BUILD_ID."
  fi
fi

info "Preflight passed."
