#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/calculator.wasm"

if [[ -d "$ROOT/wasm" && -f "$ROOT/go.mod" ]]; then
  SRC_ROOT="$ROOT"
  WASM_PKG="./wasm"
  echo "Using local Go/WASM sources from poe/"
else
  echo "ERROR: Local Go/WASM sources not found in poe/."
  echo "Expected: $ROOT/wasm + $ROOT/go.mod"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "ERROR: Go is not installed"
  exit 1
fi

mkdir -p "$ROOT/public"

pushd "$SRC_ROOT" >/dev/null
GOCACHE="/tmp/go-cache-poe-$$" GOOS=js GOARCH=wasm go build -ldflags='-s -w' -o "$OUT" "$WASM_PKG"
popd >/dev/null

if [[ -f "$OUT" ]]; then
  SIZE="$(ls -lh "$OUT" | awk '{print $5}')"
  echo "WASM built: $OUT ($SIZE)"
else
  echo "ERROR: wasm output file not created: $OUT"
  exit 1
fi
