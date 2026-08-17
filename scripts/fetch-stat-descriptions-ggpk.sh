#!/usr/bin/env bash
# Выгружает Metadata/StatDescriptions из локального GGPK (через PyPoE FileSystem)
# и собирает go-pob JSON для WASM + RePoE-массив для build:dict.
#
# Зачем отдельно от RePoE:
#   • Описания кейстоунов timeless/Abyss (keystone_abyss_*, reclaimed_malevolence_*)
#     лежат в Metadata/StatDescriptions/passive_skill_stat_descriptions.txt (UTF-16),
#     а не только в корневом stat_descriptions.txt.
#   • RePoE часто ломается на рассинхроне с локальным PyPoE; этот путь зависит только
#     от FileSystem.get_file + нашего парсера.
#
# Требует: POE_GGPK_DIR, POE_PYPOE_DIR, POE_DAT_EXPORT_DIR (.env.poe).
#
#   source scripts/load-poe-env.sh
#   npm run fetch:stat-descriptions-ggpk
#   npm run build:dict
#   npm run prepare:wasm-data && npm run wasm:build   # если нужны свежие .gz в data/

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
[[ -f "${ROOT}/scripts/load-poe-env.sh" ]] && source "${ROOT}/scripts/load-poe-env.sh"

: "${POE_GGPK_DIR:?Задайте POE_GGPK_DIR}"
: "${POE_PYPOE_DIR:?Задайте POE_PYPOE_DIR}"
: "${POE_DAT_EXPORT_DIR:?Задайте POE_DAT_EXPORT_DIR}"

GAME_ROOT="${POE_GGPK_DIR%/}"
GGPK="${GAME_ROOT}/Content.ggpk"
if [[ ! -f "${GGPK}" ]]; then
  echo "Ошибка: нет файла ${GGPK}" >&2
  exit 1
fi

OUT="${POE_DAT_EXPORT_DIR%/}/stat-descriptions-ggpk-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${OUT}"

export PATH="${HOME}/.local/bin:${PATH}"
POE_PYTHON="${POE_PYTHON:-$(command -v python3)}"

# Fix poetry extract: always pass game root via env
export POE_GGPK_DIR="${GAME_ROOT}"
echo "Извлечение StatDescriptions из GGPK → ${OUT}"
cd "${POE_PYPOE_DIR}"
poetry run python - <<PY
from PyPoE.poe.file.file_system import FileSystem
from pathlib import Path
import os

game = os.environ["POE_GGPK_DIR"]
fs = FileSystem(game)
out = Path("${OUT}")
files = [
    "Metadata/StatDescriptions/stat_descriptions.txt",
    "Metadata/StatDescriptions/passive_skill_stat_descriptions.txt",
    "Metadata/StatDescriptions/passive_skill_aura_stat_descriptions.txt",
]
for path in files:
    try:
        raw = fs.get_file(path)
    except Exception as e:
        print(f"MISS {path}: {type(e).__name__}: {e}")
        continue
    data = raw if isinstance(raw, (bytes, bytearray)) else str(raw).encode("utf-8", "replace")
    dest = out / Path(path).name
    dest.write_bytes(data)
    print(f"OK {path} -> {dest.name} ({len(data)} bytes)")
PY

PARSER="${ROOT}/scripts/parse-ggpk-stat-descriptions.py"
if [[ ! -f "${PARSER}" ]]; then
  echo "Нет парсера ${PARSER}" >&2
  exit 1
fi

DATA="${ROOT}/data"
TEMP_RU="${ROOT}/src/temp/ru"
TEMP_EN="${ROOT}/src/temp/en"
mkdir -p "${TEMP_RU}" "${TEMP_EN}"

parse_one() {
  local src_name="$1"
  local en_out="$2"
  local ru_out="$3"
  local repoe_ru="${4:-}"
  local src="${OUT}/${src_name}"
  if [[ ! -f "${src}" ]]; then
    echo "Пропуск (нет файла): ${src_name}" >&2
    return 0
  fi
  local args=(
    "${POE_PYTHON}" "${PARSER}"
    --src "${src}"
    --out-en "${en_out}"
    --out-ru "${ru_out}"
    --include-name "Metadata/StatDescriptions/stat_descriptions.txt"
  )
  if [[ -n "${repoe_ru}" ]]; then
    args+=(--out-repoe-ru "${repoe_ru}")
  fi
  "${args[@]}"
}

# Главное для кейстоунов timeless / Abyss
parse_one \
  "passive_skill_stat_descriptions.txt" \
  "${DATA}/passive_skill_stat_descriptions.json" \
  "${DATA}/passive_skill_stat_descriptions_ru.json" \
  "${TEMP_RU}/passive_skill.json"

# Копия EN descriptors в temp для build:dict (если читает оттуда)
if [[ -f "${DATA}/passive_skill_stat_descriptions.json" ]]; then
  cp -f "${DATA}/passive_skill_stat_descriptions.json" \
    "${TEMP_EN}/passive_skill_stat_descriptions.json"
fi

# Aura (если есть в GGPK)
parse_one \
  "passive_skill_aura_stat_descriptions.txt" \
  "${DATA}/passive_skill_aura_stat_descriptions.json" \
  "${DATA}/passive_skill_aura_stat_descriptions_ru.json"

# Корневой stat_descriptions — огромный; обновляем EN/RU для WASM
parse_one \
  "stat_descriptions.txt" \
  "${DATA}/stat_descriptions.json" \
  "${DATA}/stat_descriptions_ru.json"

if [[ -f "${DATA}/stat_descriptions.json" ]]; then
  cp -f "${DATA}/stat_descriptions.json" "${TEMP_EN}/stat_descriptions.json"
fi

echo ""
echo "Готово. Сырьё: ${OUT}"
echo "Обновлены data/*stat*descriptions*.json(.gz) и ${TEMP_RU}/passive_skill.json"
echo "Дальше: npm run build:dict"
echo "        npm run prepare:wasm-data && npm run wasm:build   # при необходимости"
