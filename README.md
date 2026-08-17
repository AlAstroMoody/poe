# Калькулятор вневременных самоцветов (Path of Exile 1)

Веб-приложение для расчета характеристик вневременных самоцветов (Timeless Jewels) в **Path of Exile 1** (актуально для версии **3.29**). Позволяет просматривать изменения пассивных умений на дереве для любого сида и завоевателя, поддерживает поиск по статам и полную русскую локализацию.

## Основные возможности

- **Поддержка самоцветов:** классические timeless (Vaal…Eternal), Heroic Tragedy и Abyss-глаза 3.29 (Festering Vengeance … Reclaimed Malevolence).
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

### 5. Описания статов и кейстоунов (важно для Abyss)

Эффекты кейстоунов timeless / Abyss (`keystone_divine_flesh`, `keystone_abyss_*`,
`reclaimed_malevolence_notable_*`) живут не в `.dat`, а в клиентских текстах:

`Metadata/StatDescriptions/passive_skill_stat_descriptions.txt` (**UTF-16**).

Их нужно вытянуть отдельно (после экспорта таблиц или в любой момент при обновлении патча):

```bash
source scripts/load-poe-env.sh
npm run fetch:stat-descriptions-ggpk
npm run build:dict
```

Скрипт пишет:

- `data/passive_skill_stat_descriptions.json(.gz)` + `_ru` — для WASM/тултипов;
- `data/stat_descriptions*.json(.gz)` — общий файл описаний;
- `src/temp/ru/passive_skill.json` — для `build:dict`.

Проверка, что Abyss подтянулся:

```bash
rg -a "keystone_abyss_ghastly" data/passive_skill_stat_descriptions.json
```

### 5b. Abyss LUT: какие ноды завоеваны + роллы (7–11)

У глаз (7–10) и Zorath (11) **нет круга radius**. Набор нод и роллы
зависят от сокета/сида (глаза) или от пути к старту класса + ASCS (Zorath).
Считать это на лету по всем сидам слишком дорого → предрасчёт в бинарные LUT
из данных PoB (`TimelessJewelData/Abyss*`).

#### Сборка

```bash
# глаза 7–10 (по умолчанию в скрипте)
npm run build:abyss-affected

# Zorath (#11) отдельно или вместе:
python3 scripts/build-abyss-affected-nodes.py --jewels 7 8 9 10 11
```

Выход:

| Путь | Формат | Что внутри |
|------|--------|------------|
| `public/abyss-affected/<7–10>/<socketId>.bin` | **ABY2** + gzip | на сокет: по каждому seed — список завоеванных nodeId + компоненты (APS/APA `_key` + rolls) |
| `public/abyss-affected/11/zorath.bin` | **ZOR1** + gzip | индекс нод + моды по сиду + блок ASCS (ascendancy notables) |
| `public/abyss-affected/manifest.json` | JSON | какие jewel types собраны |

Источник и расклад байтов — в шапке `scripts/build-abyss-affected-nodes.py`.
Чтение / lazy-load — `src/lib/abyssAffectedNodes.ts` (+ путь Zorath: `src/lib/zorathPath.ts`).

#### Как попадают в билд

Файлы лежат в **`public/`** → Vite **копирует их as-is в `dist/`** (не бандлит в JS).
`npm run deploy` уносит весь `dist`, включая LUT.

Сейчас порядка **~85 `.bin`, ~140 MB** на диске (gzip уже внутри каждого файла).

Это **нормально для текущей схемы**, потому что рантайм **не качает всё сразу**:

- глаз: только `…/<jewelType>/<socketId>.bin` (~1 MB) при выборе сокета;
- Zorath: один `11/zorath.bin` (~27 MB) при выборе #11.

Число файлов само по себе не проблема (статическая раздача). Реальные
ограничения — **размер репозитория / артефакта деплоя / gh-pages**, не HTTP
на клик.

#### Варианты оптимизации (если понадобится)

1. **Оставить как есть** — лучший UX при смене сокета у глаз; проще отладка.
2. **Не коммитить `.bin`**, собирать в CI перед `deploy` (`build:abyss-affected`) —
   тоньше git, тот же `dist`.
3. **Один файл на jewel type** (индекс сокетов внутри) — меньше объектов в `dist`,
   но при первом выборе типа качается ~30 MB сразу.
4. **Вынести LUT на CDN / Releases** — фронт качает по URL; `dist` лёгкий.
5. **Не хранить роллы**, считать WASM на лету только для видимых нод — сложнее
   и медленнее reverse-search по сидам.

Пока менять схему не обязательно: lazy-load уже режет трафик пользователя.

#### UI-арт коннекторов

Ядовито-зелёные связи — не из CDN skilltree sprites. Полоска из GGPK
`AbyssPassiveSkillScreenCurves*Together` лежит в
`public/abyss-connectors/AbyssLineConnectorActive.png` (см. отрисовку в
`SkillTreeCanvas.vue`).

Опционально (часто падает на рассинхроне PyPoE↔RePoE): `npm run fetch:stat-translations-ggpk`.

### 6. Дерево, словари и WASM

```bash
# тег skilltree-export (по умолчанию в скрипте — 3.29.1)
npm run fetch:skilltree-export -- 3.29.1
npm run fetch:passive-tree-ru
npm run fetch:stat-descriptions-ggpk   # если ещё не гоняли в §5
npm run build:dict

npm run prepare:wasm-data
npm run wasm:build
```

Проверка готовности: `npm run release:check`.

---

## Дополнительные скрипты

- `npm run fetch:skilltree-export` — JSON дерева с [skilltree-export](https://github.com/grindinggear/skilltree-export) (дефолт **3.29.1**).
- `npm run fetch:passive-tree-ru` — русские названия нод с ru.pathofexile.com.
- `npm run fetch:stat-descriptions-ggpk` — EN/RU описания статов и кейстоунов из GGPK (`passive_skill_stat_descriptions.txt` и др.).
- `npm run fetch:stat-translations-ggpk` — альтернатива через RePoE (хрупче).
- `npm run build:abyss-affected` — LUT глаз Abyss 7–10 → `public/abyss-affected/` (Zorath: `python3 scripts/build-abyss-affected-nodes.py --jewels 11`).
- `npm run build:dict` — словари для поиска / тултипов.
- `npm run build` — финальная сборка фронтенда (`public/` → `dist/` as-is, включая `.bin`).
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
