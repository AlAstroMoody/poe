# Калькулятор вневременных самоцветов (Path of Exile 1)

Веб-приложение для расчета характеристик вневременных самоцветов (Timeless Jewels) в **Path of Exile 1** (актуально для версии **3.29**). Позволяет просматривать изменения пассивных умений на дереве для любого сида и завоевателя, поддерживает поиск по статам и полную русскую локализацию.

## Основные возможности

- **Поддержка всех 6 самоцветов:** Vaal, Karui, Maraketh, Templar, Eternal и Heroic Tragedy.
- **Интерактивное дерево:** Визуализация изменений нод с оригинальными тултипами.
- **Поиск по характеристикам:** Поиск нужного сида по комбинации модов на выбранных нодах.
- **Локализация:** Полная поддержка русского и английского языков (включая названия нод и описания модов).
- **Высокая скорость:** Все расчеты выполняются на стороне клиента через WebAssembly (Go).

## Стек технологий

- **Frontend:** Vue 3 (Composition API), Vite, TypeScript, Tailwind CSS.
- **Core (Engine):** Go (компилируется в WASM для высокой производительности расчетов).
- **Data Pipeline:** Node.js и Bash скрипты для автоматизации извлечения данных.

---

## Быстрый запуск

Для запуска локального сервера разработки:

1. Установите зависимости:
   ```bash
   npm install
   ```
2. Запустите проект:
   ```bash
   npm run dev
   ```
3. Откройте приложение по адресу `http://localhost:5173`.

---

## Обновление данных из игры

Данные калькулятора берутся из `Content.ggpk` через **PyPoE**, плюс официальный export дерева (`grindinggear/skilltree-export`). Ниже — рабочий путь для **3.29** (с учётом граблей, которые уже ловили).

### 1. Требования

- **Node.js** + npm — скрипты проекта и фронт.
- **Go** (1.18+) — сборка WASM.
- **Python 3.11** + **Poetry** — PyPoE (системный 3.14 часто не подходит; удобно поставить 3.11 через [uv](https://github.com/astral-sh/uv)).
- **PyPoE** — клон [Project-Path-of-Exile-Wiki/PyPoE](https://github.com/Project-Path-of-Exile-Wiki/PyPoE), внутри: `poetry install` (venv лучше in-project: `poetry config virtualenvs.in-project true`).
- Установленный клиент PoE с актуальным `Content.ggpk`.

### 2. Настройка окружения

```bash
cp .env.poe.example .env.poe
# POE_GGPK_DIR      — каталог игры (внутри Content.ggpk)
# POE_PYPOE_DIR     — клон PyPoE
# POE_DAT_EXPORT_DIR — временный каталог для JSON-дампов
# POE_REPOE_DIR     — опционально, repoe-fork
# POE_PYTHON        — опционально, путь к python3.11
```

Загрузка переменных (bash и zsh):

```bash
source scripts/load-poe-env.sh
```

В PyPoE один раз (или после патча игры):

```bash
cd "$POE_PYPOE_DIR"
poetry run pypoe_schema_import -a stable
poetry run pypoe_exporter config set version GENERATED
poetry run pypoe_exporter config set ggpk_path "$POE_GGPK_DIR"
poetry run pypoe_exporter setup perform
```

### 3. Важно: `.dat64` vs `.datc64`

В актуальном клиенте таблицы лежат как `Data/*.datc64` (сжатые), а штатный `pypoe_exporter dat` historically дописывает суффикс и ищет **`*.dat64`**. Симптом: экспорт «успешен», но в логе `Skipping "Data/….dat64" (missing)`, bundle пустой / без нужных блоков.

**Обход:** в локальном PyPoE в `PyPoE/cli/exporter/dat/handler.py` при `FileNotFoundError` для `name + "64"` повторить чтение как `name + "c64"` (fallback на `.datc64`). Без этого патча обновление из GGPK на 3.29+ не заводится.

Дополнительно: `npm run import:pypoe-bundle` должен импортировать и **`PassiveSkills.dat`** (уже в `TABLE_MAP`). Иначе дерево 3.29 новее таблицы пассивов — появятся stub’ы в `prepare:wasm-data`.

### 4. Экспорт из GGPK

```bash
source scripts/load-poe-env.sh
./scripts/export-pypoe-for-poe.sh
```

Скрипт пишет JSON в `POE_DAT_EXPORT_DIR` и импортирует в `data/`: Alternate*, Stats, PassiveSkills (и RU-имена альтер-пассов, если есть).

Если падает на чтении GGPK (часто Wine/PortProton / segfault):

```bash
POE_PYPOE_DAT_SPLIT=1 ./scripts/export-pypoe-for-poe.sh
```

Либо скопировать `Content.ggpk` на обычный диск (ext4) и указать этот каталог в `POE_GGPK_DIR`.

### 5. Дерево, словари и WASM

```bash
# тег skilltree-export (по умолчанию в скрипте — 3.29.1)
npm run fetch:skilltree-export -- 3.29.1
npm run fetch:passive-tree-ru
npm run build:dict

npm run prepare:wasm-data
npm run wasm:build
```

Проверка готовности: `npm run release:check`.

---

## Дополнительные скрипты

- `npm run fetch:skilltree-export` — JSON дерева с [skilltree-export](https://github.com/grindinggear/skilltree-export) (дефолт **3.29.1**).
- `npm run fetch:passive-tree-ru` — русские названия нод с ru.pathofexile.com.
- `npm run build:dict` — словари для поиска / тултипов.
- `npm run build` — финальная сборка фронтенда.
- `npm run deploy` — деплой на GitHub Pages.
- `npm run release:check` — сверка meta дерева / stub’ов / числа нод.

## Лицензия

Данный проект распространяется под лицензией MIT — см. [LICENSE](LICENSE).

## Правовая информация

Path of Exile — товарный знак компании Grinding Gear Games. Этот проект представляет собой созданный фанатами ресурс, содержащий ссылки на другие ресурсы, и не связан с компанией Grinding Gear Games и не поддерживается ею.

---

## Благодарности и альтернативы

Идея и значительная часть логики заимствованы из проекта [vilsol's Timeless Jewels](https://vilsol.github.io/timeless-jewels). 

**Почему эта версия?**
- **Оптимизация:** Оригинальный проект (на Svelte) имел проблемы с утечками памяти. Эта версия переписана на **Vue 3** для более стабильной и долгой работы в браузере.
- **Новый контент:** Логика для самоцвета **Heroic Tragedy** была написана с нуля самостоятельно, так как в оригинальном проекте она отсутствовала.
- **Альтернативы:** Также существует проект [TimelessCalc](https://nifth.github.io/TimelessCalc/). Возможно, кому-то он покажется более удобным, несмотря на наличие своих технических нюансов.
