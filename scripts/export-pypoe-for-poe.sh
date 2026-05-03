#!/usr/bin/env bash
# Экспорт таблиц из GGPK через PyPoE → JSON bundle → импорт в data/ этого репозитория.
#
# Перед первым запуском в каталоге PyPoE:
#   poetry install
#
# Из корня репозитория poe:
#   source scripts/load-poe-env.sh
#   bash scripts/export-pypoe-for-poe.sh
#
# Сегфолт при чтении GGPK через Wine/PortProton — периодически бывает у pypoe_exporter (нативный код).
# Обходы:
#   • Скопировать Content.ggpk в обычный каталог на ext4 (без префикса Wine), выставить POE_GGPK_DIR туда.
#   • Принудительно экспорт по одной таблице: POE_PYPOE_DAT_SPLIT=1 bash scripts/export-pypoe-for-poe.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
[[ -f "${ROOT}/scripts/load-poe-env.sh" ]] && source "${ROOT}/scripts/load-poe-env.sh"

: "${POE_GGPK_DIR:?Задайте POE_GGPK_DIR в .env.poe}"
: "${POE_DAT_EXPORT_DIR:?Задайте POE_DAT_EXPORT_DIR в .env.poe}"
: "${POE_PYPOE_DIR:?Задайте POE_PYPOE_DIR в .env.poe}"

mkdir -p "${POE_DAT_EXPORT_DIR}"
OUT_JSON="${POE_DAT_EXPORT_DIR}/alternate_bundle.json"

DAT_FILES=(
  AlternateTreeVersions.dat
  AlternatePassiveSkills.dat
  AlternatePassiveAdditions.dat
  Stats.dat
  PassiveSkills.dat
)

export_dat_json_split_to() {
  local target="$1"
  shift
  local files=("$@")
  local parts=()
  local i=0
  for f in "${files[@]}"; do
    local part="${POE_DAT_EXPORT_DIR}/_pypoe_part_${i}.json"
    echo "PyPoE: экспорт только ${f} → ${part}"
    poetry run pypoe_exporter dat json "${part}" --files "${f}"
    parts+=("${part}")
    i=$((i + 1))
  done
  node "${ROOT}/scripts/merge-pypoe-dat-json-bundles.mjs" "${target}" "${parts[@]}"
  rm -f "${parts[@]}"
}

export_dat_json_main() {
  local target="$1"
  shift
  local files=("$@")
  poetry run pypoe_exporter dat json "${target}" --files "${files[@]}"
}

echo "PyPoE: ggpk → ${OUT_JSON}"

cd "${POE_PYPOE_DIR}"
poetry run pypoe_exporter config set ggpk_path "${POE_GGPK_DIR}"
poetry run pypoe_exporter setup perform

if [[ "${POE_PYPOE_DAT_SPLIT:-}" == "1" ]]; then
  export_dat_json_split_to "${OUT_JSON}" "${DAT_FILES[@]}"
else
  set +e
  export_dat_json_main "${OUT_JSON}" "${DAT_FILES[@]}"
  rc=$?
  set -e
  if [[ "${rc}" -ne 0 ]]; then
    echo "" >&2
    echo "=== экспорт всех таблиц одним запуском завершился с кодом ${rc} (часто 139 = segfault через Wine-путь к GGPK) ===" >&2
    echo "Повтор по одной таблице и склейка bundle …" >&2
    export_dat_json_split_to "${OUT_JSON}" "${DAT_FILES[@]}"
  fi
fi

OUT_JSON_RU="${POE_DAT_EXPORT_DIR}/alternate_passive_skills_ru_bundle.json"
echo "PyPoE: русские имена AlternatePassiveSkills (Data/Russian/) → ${OUT_JSON_RU}"
if poetry run pypoe_exporter dat json "${OUT_JSON_RU}" \
  --files AlternatePassiveSkills.dat \
  --language Russian; then
  cd "${ROOT}"
  node scripts/extract-alternate-passive-names-ru-from-pypoe-bundle.mjs "${OUT_JSON_RU}"
  cd "${POE_PYPOE_DIR}"
else
  echo "Предупреждение: экспорт AlternatePassiveSkills с -language Russian не удался (нет Data/Russian/ в GGPK?)." >&2
  echo "Русские названия альтер-пассов можно добрать через npm run fetch:alternate-names (PoEDB)." >&2
fi

echo "Импорт в ${ROOT}/data …"
cd "${ROOT}"
npm run import:pypoe-bundle -- "${OUT_JSON}"

echo "Дальше при необходимости: npm run prepare:wasm-data && npm run wasm:build"

# =============================================================================
# Русские строки для UI (build:dict / src/temp/ru/passive_skill.json)
# =============================================================================
# Этот скрипт обновляет только Stats / альтернативные пассивы для Go (data/*.json).
# Формат RePoE (массив с ids + Russian[].string) PyPoE так не отдаёт — его даёт
# отдельный экспортёр RePoE или уже собранные архивы go-pob-data.
#
# Что сделать для актуальных RU-переводов статов:
#   • Клонировать RePoE (например https://github.com/brather1ng/RePoE ), настроить
#     путь к каталогу с Content.ggpk, выполнить их export → в out/ появятся
#     stat_translations; скопировать нужное в src/temp/ru/passive_skill.json (и при
#     необходимости stat_translations.json), затем npm run build:dict.
#   • Либо локально запустить go-pob-data против установленной игры и забрать
#     stat_translations/ru/*.json.gz (см. scripts/extract-go-pob-data-local.mjs).
#   • Временно — зеркало https://repoe-fork.github.io/Russian/stat_translations/
