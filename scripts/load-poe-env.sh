#!/usr/bin/env bash
# Загружает переменные из .env.poe в текущую оболочку (POE_GGPK_DIR, POE_DAT_EXPORT_DIR, POE_PYPOE_DIR).
# Использование из корня репозитория:
#   source scripts/load-poe-env.sh
#
# Не используем здесь set -u / set -e: при source это наследуется интерактивной оболочкой и ломает
# подстановки с «пустыми» переменными (ошибки вида unbound variable / «не заданы границы»).

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_ROOT="$(cd "${_SCRIPT_DIR}/.." && pwd)"
_ENV="${_REPO_ROOT}/.env.poe"

if [[ -f "${_ENV}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${_ENV}"
  set +a
else
  echo "PoE env: нет файла ${_ENV}. Скопируйте .env.poe.example в .env.poe и задайте пути." >&2
fi
