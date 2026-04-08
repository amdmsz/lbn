#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_ROOT="$PROJECT_ROOT/public"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups/runtime-assets}"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"

ASSETS=()

if [[ -d "$PUBLIC_ROOT/exports" ]]; then
  ASSETS+=("exports")
fi

if [[ -d "$PUBLIC_ROOT/uploads" ]]; then
  ASSETS+=("uploads")
fi

if [[ "${#ASSETS[@]}" -eq 0 ]]; then
  echo "No runtime asset directories found under $PUBLIC_ROOT." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

OUTPUT_FILE="$BACKUP_DIR/runtime-assets-${TIMESTAMP}.tar.gz"

tar -czf "$OUTPUT_FILE" -C "$PUBLIC_ROOT" "${ASSETS[@]}"

echo "Runtime asset backup created: $OUTPUT_FILE"
