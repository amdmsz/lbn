#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-}"
CURL_BIN="${CURL_BIN:-curl}"
REQUEST_TIMEOUT_SECONDS="${REQUEST_TIMEOUT_SECONDS:-15}"
CURL_INSECURE="${CURL_INSECURE:-0}"

info() {
  echo "[release-smoke] $*"
}

fail() {
  echo "[release-smoke] ERROR: $*" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

normalize_base_url() {
  local url="$1"
  echo "${url%/}"
}

matches_expected_code() {
  local actual="$1"
  local expected_csv="$2"
  local candidate

  IFS=',' read -r -a expected_codes <<<"$expected_csv"
  for candidate in "${expected_codes[@]}"; do
    if [[ "$actual" == "$candidate" ]]; then
      return 0
    fi
  done

  return 1
}

request_path() {
  local path="$1"
  local expected_codes="$2"
  local description="$3"
  local curl_args
  local response
  local status_code
  local redirect_url

  curl_args=(
    -sS
    --max-time "$REQUEST_TIMEOUT_SECONDS"
    -o /dev/null
    -w "%{http_code}|%{redirect_url}"
  )

  if [[ "$CURL_INSECURE" == "1" ]]; then
    curl_args+=(-k)
  fi

  response="$("$CURL_BIN" "${curl_args[@]}" "${BASE_URL}${path}")"
  status_code="${response%%|*}"
  redirect_url="${response#*|}"

  if matches_expected_code "$status_code" "$expected_codes"; then
    if [[ -n "$redirect_url" ]]; then
      info "PASS ${description}: ${path} -> ${status_code} (${redirect_url})"
    else
      info "PASS ${description}: ${path} -> ${status_code}"
    fi
    return
  fi

  if [[ -n "$redirect_url" ]]; then
    fail "${description} failed: ${path} returned ${status_code} (${redirect_url}), expected one of ${expected_codes}"
  fi

  fail "${description} failed: ${path} returned ${status_code}, expected one of ${expected_codes}"
}

if [[ -z "$BASE_URL" ]]; then
  fail "Usage: bash scripts/release-smoke.sh <base-url>"
fi

BASE_URL="$(normalize_base_url "$BASE_URL")"

require_command "$CURL_BIN"

info "Running smoke checks against ${BASE_URL}"

request_path "/login" "200" "login page"
request_path "/products" "200,302,303,307,308" "products route"
request_path "/customers" "200,302,303,307,308" "customers route"
request_path "/orders" "200,302,303,307,308" "orders route"
request_path "/file.svg" "200" "static asset"
request_path "/api/auth/session" "200" "auth session api"

info "Smoke checks passed."
