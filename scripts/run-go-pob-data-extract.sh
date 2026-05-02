#!/usr/bin/env bash
# Run go-pob-data extraction against your installed Path of Exile client (if bundle format matches).
#
# Не у всех установок PoE загрузчик бандлов из go-pob-data совместим с каталогом игры;
# если go run здесь падает или формат файлов не тот — этот скрипт не обязателен; для .dat
# используйте PyPoE (poetry). Тексты stat_descriptions всё равно из клиентских .txt в бандлах —
# их нужно извлекать тем инструментом, который понимает ваш клиент.
#
# Requires:
#   - Go toolchain
#   - Game dir with Bundles2/_.index.bin (Steam/Proton: .../common/Path of Exile/)
#   - curl
#   - pngquant, ImageMagick (ImageMagick wand) — used when exporting DDS icons in go-pob-data raw.go
#
# Env (required):
#   GO_POB_DATA_DIR  — path to cloned go-pob-data
#   POE_GAME_PATH    — directory containing Bundles2 (trailing slash optional)
#   POE_TREE_VERSION — tag from grindinggear/skilltree-export, e.g. 3.28.0 (see tree.go)
#   POE_GAME_VERSION — output folder name, e.g. 3.28.0.7 (patch.build from client or your label)
#
# After success:
#   POE_GAME_VERSION=<same> npm run extract:go-pob-copy
#
set -euo pipefail

: "${GO_POB_DATA_DIR:?Set GO_POB_DATA_DIR to your clone of go-pob-data}"
: "${POE_GAME_PATH:?Set POE_GAME_PATH to Path of Exile install dir (with Bundles2)}"
: "${POE_TREE_VERSION:?Set POE_TREE_VERSION e.g. 3.28.0}"
: "${POE_GAME_VERSION:?Set POE_GAME_VERSION e.g. 3.28.0.7}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -f "${POE_GAME_PATH%/}/Bundles2/_.index.bin" ]]; then
  echo "error: expected ${POE_GAME_PATH%/}/Bundles2/_.index.bin" >&2
  exit 1
fi

mkdir -p "${GO_POB_DATA_DIR}/data/${POE_GAME_VERSION}"
curl -fsSL -o "${GO_POB_DATA_DIR}/data/${POE_GAME_VERSION}/schema.min.json" \
  "https://github.com/poe-tool-dev/dat-schema/releases/download/latest/schema.min.json"

cd "${GO_POB_DATA_DIR}"
go run . "${POE_GAME_PATH}" "${POE_TREE_VERSION}" "${POE_GAME_VERSION}"

echo ""
echo "Done. Copy into project:"
echo "  cd ${ROOT}"
echo "  POE_GAME_VERSION=${POE_GAME_VERSION} GO_POB_DATA_DIR=${GO_POB_DATA_DIR} npm run extract:go-pob-copy"
