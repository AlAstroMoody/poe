# Вневременные самоцветы — калькулятор для POE

Веб-калькулятор для подбора сидов и завоевателей у всех пяти вневременных самоцветов Path of Exile. Выбираешь самоцвет, завоевателя, вбиваешь сид — смотришь, какие ноды на дереве меняются и что дают. Есть поиск по статам (найти сид, где на нужных нодах выпадают нужные моды), ссылки на обмен, дерево с тултипами и русской локализацией.

WASM-калькулятор собирается локально в этом проекте (`public/calculator.wasm`). Данные дерева и переводов обновляются скриптами. Интерфейс: Vue 3, Vite, TypeScript, Tailwind.

## Запуск

```bash
npm install
npm run dev
```

Сборка: `npm run build`. Превью продакшена: `npm run preview`.

## Скрипты по данным

- `npm run fetch:skilltree-export` — скачать официальный экспорт дерева PoE1 (GGG).
- `npm run fetch:passive-tree-ru` — подтянуть русские названия нод пассивного дерева.
- `npm run fetch:alternate-names` — подтянуть альтернативные названия нод под самоцветы.
- `npm run build:dict` — пересобрать словарь переводов статов.
- `npm run prepare:wasm-data` — обновить `SkillTree.json(.gz)` и провалидировать `data/*.json.gz` для `go:embed`.
- `npm run import:pypoe-bundle` — превратить JSON из PyPoE в плоские `data/*.json.gz`.
- `npm run wasm:build` — собрать `public/calculator.wasm` локально из Go-кода в `poe/`.
- `npm run pipeline:refresh` — регулярный цикл обновления данных и пересборки wasm (без долгого PoEDB шага).
- `npm run pipeline:refresh:full` — полный цикл, включая `fetch:alternate-names`.

Без них приложение уже работает, но часть текста будет на английском.

### Русские stat_translations (опционально)

Те же дампы в формате RePoE (`ids`, `Russian[].string` и т.д.) можно взять с зеркала [**RePoE fork — Russian**](https://repoe-fork.github.io/Russian/). Для строк пассивных статов (шаблоны с `{0}`, многострочные кистоуны) — один файл:

**Куда:** `src/temp/ru/passive_skill.json` (папка `src/temp/ru/` в корне репозитория).  
**Как назвать:** ровно `passive_skill.json` — так его читает `scripts/build-stat-dict.mjs` (это не `passive_skill_stat_descriptions` из go-pob и не gzip из `public/data`).

Скачать и пересобрать словарь:

```bash
curl -fsSL -o src/temp/ru/passive_skill.json \
  'https://repoe-fork.github.io/Russian/stat_translations/passive_skill.json'
npm run build:dict
```

Источник: [`https://repoe-fork.github.io/Russian/stat_translations/passive_skill.json`](https://repoe-fork.github.io/Russian/stat_translations/passive_skill.json). Файл подхватывается после общего `stat_translations.json`, чтобы многострочные варианты не затирались. Другие JSON из [каталога `stat_translations`](https://repoe-fork.github.io/Russian/stat_translations/) при необходимости кладите в `src/temp/ru/` под именами из скрипта (`stat_translations.json`, `advanced_mod.json`, `stat_translations_repoe_ru.json`). Это комьюнити-зеркало; актуальность сверяйте с патчем игры.

## Деплой

Настроен выкладка на GitHub Pages через `npm run deploy` (ветка `gh-pages`, папка `dist`).

---

## Новый pipeline данных/WASM

В `poe/` добавлен автономный pipeline (этап миграции):

- `npm run fetch:skilltree-export` — скачать официальные данные дерева PoE1 из `grindinggear/skilltree-export` (`data.json`, `alternate.json`, `ruthless*.json`) в `src/temp/en/skilltree-export/`.
- `npm run prepare:wasm-data` — обновить реальные входы для Go/WASM в `data/` (в т.ч. `SkillTree.json` + `SkillTree.json.gz` из официального `skilltree-export/data.json`) и провалидировать обязательные `*.json.gz` для `go:embed`.
- `npm run wasm:build` — собрать `public/calculator.wasm`.
- `npm run pipeline:refresh` — полный цикл: fetch + RU словари + dict + prepare + wasm build.

### Важно (текущий этап миграции)

`wasm:build` собирает `public/calculator.wasm` только из локальных Go-исходников внутри `poe/` (`go.mod`, `wasm/`, `calculator/`, `data/`, `random/`).

Fallback на родительский репозиторий удалён: теперь сборка детерминирована и автономна в рамках `poe/`.

## WASM и данные

Сборка и расчёт полностью из этого репозитория: `public/calculator.wasm` из `npm run wasm:build`, входы — ваши файлы в `data/*.json.gz` + дерево после `prepare:wasm-data`.

По умолчанию приложение загружает WASM локально: `/calculator.wasm` (из `public/`).

Опционально можно задать удалённый fallback через env:

```bash
VITE_DATA_URL=https://example.com npm run dev
```

Тогда при неудаче локальной загрузки будет попытка взять `${VITE_DATA_URL}/calculator.wasm`.

### Если альтернативы под самоцвет не совпадают с игрой

1. Обновить дампы под ваш патч: экспорт из GGPK/PyPoE → `npm run import:pypoe-bundle -- …`, затем `npm run prepare:wasm-data && npm run wasm:build`.
2. Строка «⚠ Заглушка passive_skills» в тултипе: в `passive_skills` нет строки под эту ноду — дерево новее дампа; обновите соответствующий gzip в `data/` и пересоберите WASM.

## Полная инструкция: от игры до калькулятора

Чтобы обновить данные после патча игры или добавить новый самоцвет:

### 1. Установка PyPoE

```bash
git clone https://github.com/omegak2/pypoe.git
cd pypoe
poetry install
```

### 2. Настройка окружения

Скопируйте шаблон и заполните пути:

```bash
cp .env.poe.example .env.poe
# Отредактируйте .env.poe:
# POE_GGPK_DIR=/path/to/Path/of/Exile  # папка с Content.ggpk
# POE_PYPOE_DIR=/path/to/pypoe         # клон репозитория
# POE_DAT_EXPORT_DIR=/tmp/poe-export   # куда сохранять JSON
```

### 3. Автоматический экспорт и импорт

```bash
source scripts/load-poe-env.sh
./scripts/export-pypoe-for-poe.sh
```

Этот скрипт сделает всё: экспорт из GGPK → склейку → импорт в `data/`.

### 4. Пересборка WASM

```bash
npm run prepare:wasm-data && npm run wasm:build
```

Готово! Калькулятор теперь с актуальными данными из игры.

### Ручной экспорт (если автоматика не сработала)

```bash
cd $POE_PYPOE_DIR
poetry run pypoe_exporter dat json /tmp/poe-export.json \
  --files AlternateTreeVersions.dat AlternatePassiveSkills.dat \
  AlternatePassiveAdditions.dat Stats.dat PassiveSkills.dat

cd /path/to/this/project
npm run import:pypoe-bundle -- /tmp/poe-export.json
npm run prepare:wasm-data && npm run wasm:build
```

## Heroic Tragedy: где брать данные

Короткая памятка для будущих обновлений нового вневременного самоцвета.

### 1) Основной raw-источник для Go/WASM

Данные теперь берутся напрямую из игры через **PyPoE** экспорт, а не из внешнего CDN.

**Команды для обновления:**

```bash
# Экспорт из GGPK игры через PyPoE
poetry run pypoe_exporter dat json /path/to/output/poe-dat.json --files Stats.dat PassiveSkills.dat AlternatePassiveSkills.dat AlternatePassiveAdditions.dat AlternateTreeVersions.dat

# Импорт в проект
npm run import:pypoe-bundle -- /path/to/output/poe-dat.json

# Пересборка WASM с новыми данными
npm run prepare:wasm-data && npm run wasm:build
```

**Ключевые файлы данных:**

- `data/alternate_tree_versions.json.gz` — версии самоцветов (1-6)
- `data/alternate_passive_skills.json.gz` — альтернативные пассивки
- `data/alternate_passive_additions.json.gz` — добавочные эффекты
- `data/stats.json.gz` — статы для отображения

Важно: если в `AlternateTreeVersions` только `Vaal/Karui/Maraketh/Templar/Eternal`, то Heroic Tragedy в этом срезе ещё нет.

### 2) Что уже есть у Path of Building

- В PoB есть модуль пассивок timeless-типов:  
  `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/dev/src/Data/TimelessJewelData/LegionPassives.lua`
- В нём уже встречаются kalguur-пассивки:
  - `kalguur_notable_*`
  - `kalguur_keystone_1..3`
  - `Black Scythe Training`, `Celestial Mathematics`, `The Unbreaking Circle`

Важно: по обсуждению PoB keystone-поддержка появилась раньше полного сид-расчёта обычных/notable нод. То есть `LegionPassives.lua` полезен как справочник "какие эффекты существуют", но не всегда даёт полный mapping `(seed, node) -> result`.

### 3) Мини-чеклист перед интеграцией

1. В `AlternateTreeVersions` появился новый тип (кроме 1..5 старых legion-типов).
2. В `AlternatePassiveSkills` появился новый `AlternateTreeVersionsKey`.
3. В `AlternatePassiveAdditions` есть тот же ключ (если механика добавок используется).
4. После этого расширяем `data/jewels.go` (новый `JewelType`, conqueror/line mapping, seed range), затем UI-словарь в `src/lib/dict.ts`.
