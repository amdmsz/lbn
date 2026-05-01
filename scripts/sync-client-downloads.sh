#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-$PROJECT_ROOT/public/downloads}"
RELEASE_TAG="${1:-latest}"
CLIENT_VERSION="${CLIENT_VERSION:-}"
ANDROID_RELEASE_ASSET="${ANDROID_RELEASE_ASSET:-Lbn-CRM-Android.apk}"

if [[ -z "$CLIENT_VERSION" ]]; then
  CLIENT_VERSION="$(node -p "require('./public/client-update.json').version")"
fi

if [[ "$RELEASE_TAG" == "latest" ]]; then
  RELEASE_BASE_URL="https://github.com/amdmsz/lbn/releases/latest/download"
else
  RELEASE_BASE_URL="https://github.com/amdmsz/lbn/releases/download/$RELEASE_TAG"
fi

download_asset() {
  local source_name="$1"
  local target_name="$2"
  local target_path="$DOWNLOAD_DIR/$target_name"
  local tmp_path="$target_path.tmp"

  echo "[sync-client-downloads] Downloading $source_name -> $target_name"
  curl -fL --retry 3 --retry-delay 2 -o "$tmp_path" "$RELEASE_BASE_URL/$source_name"
  mv "$tmp_path" "$target_path"
  chmod 0644 "$target_path"
}

mkdir -p "$DOWNLOAD_DIR"

download_asset "$ANDROID_RELEASE_ASSET" "Lbn-CRM-Android.apk"
download_asset "Lbn-CRM-${CLIENT_VERSION}-x64.zip" "Lbn-CRM-${CLIENT_VERSION}-x64.zip"
download_asset "Lbn-CRM-${CLIENT_VERSION}-x64.exe" "Lbn-CRM-${CLIENT_VERSION}-x64.exe"

echo "[sync-client-downloads] Done."
ls -lh "$DOWNLOAD_DIR"
