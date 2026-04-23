#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_ROOT/.env}"
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

run_step() {
  info "Running: $*"
  "$@"
}

assert_clean_worktree() {
  local status_output
  status_output="$(git status --short)"
  if [[ -n "$status_output" ]]; then
    echo "$status_output"
    fail "Git working tree is not clean."
  fi
}

assert_git_path_clean() {
  local relative_path="$1"
  local status_output
  status_output="$(git status --short -- "$relative_path")"
  if [[ -n "$status_output" ]]; then
    echo "$status_output"
    fail "Tracked release artifact is dirty: $relative_path"
  fi
}

assert_module_resolvable() {
  local module_name="$1"
  local detail="$2"

  if ! node -e "require.resolve(process.argv[1])" "$module_name" >/dev/null 2>&1; then
    fail "Missing required build-time module: $module_name" "$detail"
  fi
}

run_prisma_status_gate() {
  local output
  local exit_code

  set +e
  output="$(npx prisma migrate status 2>&1)"
  exit_code=$?
  set -e

  echo "$output"

  if [[ $exit_code -eq 0 ]]; then
    return
  fi

  if grep -qi "failed migrations" <<<"$output"; then
    fail "Detected failed Prisma migrations." "先修复目标库中的 failed migration，再继续发布。"
  fi

  if grep -qi "not yet been applied" <<<"$output"; then
    info "Pending Prisma migrations detected. Build may continue, but formal release must run prisma migrate deploy after build."
    return
  fi

  fail "npx prisma migrate status failed." "$output"
}

require_command git
require_command node
require_command npm
require_command npx

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Current directory is not a Git worktree."

if [[ "$REQUIRE_CLEAN_WORKTREE" == "1" ]]; then
  assert_clean_worktree
fi

assert_git_path_clean "package-lock.json"

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

info "Installing exact release dependencies with devDependencies included."
info "This repository builds through postcss.config.mjs, which imports @tailwindcss/postcss at build time. If the server installs with omit=dev, Next/Tailwind build will fail before the app can start."
run_step npm ci --include=dev

assert_git_path_clean "package-lock.json"

assert_module_resolvable \
  "@tailwindcss/postcss" \
  "postcss.config.mjs loads @tailwindcss/postcss during npm run build. Do not use npm install --omit=dev or any production-only install mode for release builds."
assert_module_resolvable \
  "tailwindcss" \
  "tailwindcss is required at build time together with @tailwindcss/postcss."
assert_module_resolvable \
  "typescript" \
  "Next.js type checking during npm run build depends on TypeScript being installed."
assert_module_resolvable \
  "eslint" \
  "Release preflight runs npm run lint, which requires eslint from devDependencies."

run_step npx prisma validate
run_step npx prisma generate
run_step npm run lint
run_step npm run build

if [[ ! -f "$PROJECT_ROOT/.next/BUILD_ID" ]]; then
  fail "Build completed without .next/BUILD_ID."
fi

info "Running explicit Prisma migration status gate."
run_prisma_status_gate

info "Running Prisma predeploy guardrails with pending-migration tolerance for release flow."
run_step npm run prisma:predeploy:check -- --allow-pending-migrations --allow-schema-diff

info "Preflight passed."
