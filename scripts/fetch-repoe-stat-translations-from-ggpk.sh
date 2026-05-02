#!/usr/bin/env bash
# Выгружает русские stat_translations из локального GGPK через repoe-fork/RePoE (тот же пайплайн,
# что у https://repoe-fork.github.io/Russian/ ). Результат кладётся в src/temp/ru/ для npm run build:dict.
#
# Не используйте случайный zip «RePoE-master» с сайта — он расходится с актуальным PyPoE.
# Нужен именно git clone https://github.com/repoe-fork/repoe.git рядом с PyPoE → POE_REPOE_DIR.
#
# Условия:
#   • Уже клонированный repoe-fork/repoe: задайте POE_REPOE_DIR в .env.poe (путь к корню репозитория repoe).
#     Если не задан — берётся "$(dirname POE_PYPOE_DIR)/repoe". Автоматический git clone отключён;
#     первый раз можно: POE_REPOE_AUTO_CLONE=1 npm run fetch:stat-translations-ggpk
#   • В pyproject.toml repoe указано pypoe = { path = "../PyPoE" } — PyPoE должен быть соседом каталога repoe.
#   • Нужны сеть (модуль stat_translations один раз дергает trade API GGG) и рабочий Poetry + зависимости PyPoE.
#
# Запуск из корня этого репозитория:
#   source scripts/load-poe-env.sh
#   bash scripts/fetch-repoe-stat-translations-from-ggpk.sh
#
# После успеха:
#   npm run build:dict

set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
[[ -f "${ROOT}/scripts/load-poe-env.sh" ]] && source "${ROOT}/scripts/load-poe-env.sh"

: "${POE_GGPK_DIR:?Задайте POE_GGPK_DIR}"
: "${POE_PYPOE_DIR:?Задайте POE_PYPOE_DIR}"
: "${POE_DAT_EXPORT_DIR:?Задайте POE_DAT_EXPORT_DIR}"

POE_REPOE_DIR="${POE_REPOE_DIR:-$(dirname "${POE_PYPOE_DIR}")/repoe}"

# POE_GGPK_DIR — каталог установки (рядом с PathOfExile.exe); внутри должен быть Content.ggpk.
# В PyPoE FileSystem аргумент — именно этот каталог, не путь к файлу Content.ggpk (иначе ENOTDIR на Bundles2/_.index.bin).
GAME_ROOT="${POE_GGPK_DIR%/}"
GGPK="${GAME_ROOT}/Content.ggpk"
if [[ ! -f "${GGPK}" ]]; then
  echo "Ошибка: нет файла ${GGPK}" >&2
  exit 1
fi

if [[ ! -d "${POE_PYPOE_DIR}" ]]; then
  echo "Ошибка: нет каталога POE_PYPOE_DIR=${POE_PYPOE_DIR}" >&2
  exit 1
fi

# В pyproject.toml repoe: pypoe = { path = "../PyPoE" } — от родителя каталога repoe.
EXPECTED_PYPOE="$(cd "$(dirname "${POE_REPOE_DIR}")" && pwd)/PyPoE"
PYPOE_REAL="$(cd "${POE_PYPOE_DIR}" && pwd)"
if [[ "${PYPOE_REAL}" != "${EXPECTED_PYPOE}" ]] && [[ ! -e "${EXPECTED_PYPOE}" ]]; then
  echo "Внимание: Poetry в repoe ждёт PyPoE здесь: ${EXPECTED_PYPOE}" >&2
  echo "У вас PyPoE: ${PYPOE_REAL}. Один раз создайте ссылку (без копирования):" >&2
  echo "  ln -sfn \"${PYPOE_REAL}\" \"${EXPECTED_PYPOE}\"" >&2
  echo "Либо поменяйте path к PyPoE в ${POE_REPOE_DIR}/pyproject.toml" >&2
  exit 1
fi

mkdir -p "${POE_DAT_EXPORT_DIR}"

REPARSER="${POE_REPOE_DIR}/RePoE/run_parser.py"
if [[ ! -f "${REPARSER}" ]]; then
  if [[ "${POE_REPOE_AUTO_CLONE:-}" == "1" ]]; then
    echo "Клонируем repoe-fork/repoe → ${POE_REPOE_DIR} (POE_REPOE_AUTO_CLONE=1)"
    mkdir -p "$(dirname "${POE_REPOE_DIR}")"
    git clone https://github.com/repoe-fork/repoe.git "${POE_REPOE_DIR}"
  else
    echo "Не найден ${REPARSER}" >&2
    echo "Укажите в .env.poe каталог вашего репозитория: POE_REPOE_DIR=/полный/путь/к/repoe" >&2
    echo "(папка должна содержать RePoE/run_parser.py.)" >&2
    echo "Первый запуск с нуля: POE_REPOE_AUTO_CLONE=1 npm run fetch:stat-translations-ggpk" >&2
    exit 1
  fi
fi

OUT="${POE_DAT_EXPORT_DIR%/}/repoe-stat-translations-ru-$(date +%Y%m%d-%H%M%S)"
mkdir -p "${OUT}"

echo "Poetry install в ${POE_REPOE_DIR} …"
cd "${POE_REPOE_DIR}"
# RePoE импортирует все парсеры при старте; на Python <3.12 часть исходников ломается (вложенные f-строки).
# По умолчанию берём системный python3; переопределение: POE_PYTHON=/usr/bin/python3.12
POE_PYTHON="${POE_PYTHON:-$(command -v python3)}"
echo "Poetry: интерпретатор ${POE_PYTHON} (переменная POE_PYTHON)"
poetry env use "${POE_PYTHON}"
if ! poetry install; then
  echo "" >&2
  echo "=== poetry install не удался — экспорт из GGPK не запускался ===" >&2
  echo "Частые причины на Fedora/Linux:" >&2
  echo "  sudo dnf install python3-devel   # заголовки Python (Python.h)" >&2
  echo "Для repoe нужен Python ≥3.12 (синтаксис f-строк в парсерах). На Fedora обычно хватает системного python3." >&2
  echo "  cd \"${POE_REPOE_DIR}\" && poetry env use \"\$(command -v python3)\" && poetry install" >&2
  echo "Если сборка колёс numpy/PyPoE на 3.14 падает — задайте POE_PYTHON=/usr/bin/python3.12 и повторите." >&2
  exit 1
fi

echo "Экспорт stat_translations (Russian) из GGPK …"
cd "${POE_REPOE_DIR}/RePoE"
poetry run python run_parser.py stat_translations \
  -f "${GAME_ROOT}" \
  -o "${OUT}" \
  -l Russian

# В run_parser.py при заданном -o и одном языке подкаталог по языку не добавляется — русский вывод в корне OUT,
# а не в OUT/Russian (как без -o в дефолтном __DATA_PATH__).
RU="${OUT}/Russian"
if [[ ! -d "${RU}" ]]; then
  RU="${OUT}"
fi
if [[ ! -d "${RU}/stat_translations" ]] && [[ ! -f "${RU}/stat_translations.json" ]]; then
  echo "Ошибка: нет вывода stat_translations в ${OUT} (ожидались stat_translations/ или stat_translations.json)" >&2
  exit 1
fi

DEST="${ROOT}/src/temp/ru"
mkdir -p "${DEST}"

copy_if() {
  local src="$1" dest="$2"
  if [[ -f "${src}" ]]; then
    cp -v "${src}" "${dest}"
  else
    echo "Нет файла (пропуск): ${src}" >&2
  fi
}

# Основной «корень» stat_descriptions (исключение в RePoE)
copy_if "${RU}/stat_translations.json" "${DEST}/stat_translations.json"

# Подкаталог stat_translations/ (passive_skill, advanced_mod, …)
if [[ -d "${RU}/stat_translations" ]]; then
  copy_if "${RU}/stat_translations/passive_skill.json" "${DEST}/passive_skill.json"
  copy_if "${RU}/stat_translations/advanced_mod.json" "${DEST}/advanced_mod.json"
fi

copy_if "${RU}/stat_value_handlers.json" "${DEST}/stat_value_handlers.json"

echo ""
echo "Готово. Обновлены файлы в ${DEST}"
echo "Полный вывод RePoE: ${RU}"
echo "Дальше: npm run build:dict"
