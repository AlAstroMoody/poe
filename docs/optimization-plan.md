# План оптимизаций: загрузка, WASM, фронт

Набросок по текущему состоянию (ориентиры размеров на момент заметки):

| Артефакт | Размер | Комментарий |
| --- | --- | --- |
| `public/calculator.wasm` | ~8.7 MB | скачивается при входе в дерево |
| `dist/assets/TreeView-*.js` | ~6.9 MB | весь словарь статов + canvas + меню |
| `src/lib/*generated*` (суммарно) | ~6+ MB исходников | большая часть уезжает в TreeView-чанк |
| `data/stats.json.gz` | ~856 KB gz | **все** Stats.dat внутри WASM |
| `data/SkillTree.json.gz` | ~432 KB gz | дерево целиком в WASM (+ снова на фронте) |
| `public/abyss-affected/` | ~143 MB | уже lazy по сокету, но тяжёлые `.bin` |

Цель: быстрее first paint / TTI на `/tree`, меньше трафика, проще сопровождать пайплайн данных.

---

## 1. WASM / Go data — что лишнее

Сейчас `data/main.go` **embed + gunzip + JSON parse** при старте модуля, `wasm/exposition` отдаёт наружу почти всё.

### 1.1. Вынести «данные для UI» из WASM

В WASM сейчас дублируется то, что фронту нужно как JSON-строки, а калькулятору — нет (или почти нет):

- `SkillTree` / `SkillTreeJSON` — дерево для отрисовки; расчёту нужны в основном флаги нод / mapping, не спрайты и геометрия целиком.
- `StatTranslationsJSON` + passive/aura + **RU** варианты — UI уже имеет `statNames*.generated.ts` / `passive_node_ru.json`.
- `PossibleStats` — только селект/сортировка на фронте.
- `PassiveSkills` / полный `TreeToPassive` с лишними полями — для UI достаточно `{ Index, PassiveSkillGraphID, StatsKeys?, IsNotable?, … }`.

**Идея:** WASM = только `Calculate` / `ReverseSearch` / `Get*ByIndex` + минимальные таблицы APS/APA/ATV/passive/stats (урезанные). Остальное — отдельные `fetch` JSON (gzip) с `public/data/…`, грузить параллельно / по необходимости.

### 1.2. Урезать `stats.json` внутри калькулятора

`GetStatByIndex` отдаёт полный ряд Stats.dat (~23k записей). Для timeless/abyss нужны:

- статы из `alternate_passive_* .StatsKeys`;
- статы из `possible_stats`;
- (опционально) статы с затронутых `passive_skills`.

**Идея:** скрипт `trim-stats-for-wasm` — оставить только используемые `_key` (+ соседей min/max). Остальные ID на фронте — из лёгкого словаря.

### 1.3. Не gunzip+Unmarshal огромных JSON при `init()`

Сейчас каждый embed разжимается синхронно при инстанцировании WASM → долгий main-thread stall после скачивания.

**Идеи:**

- хранить в embed уже нужный бинарный формат (msgpack / flatbuffers / кастомный), без JSON;
- или lazy: парсить переводы только при первом обращении (лучше вообще убрать из WASM — п. 1.1);
- не делать `json.Marshal(SkillTreeData)` обратно в строку для фронта — отдавать gzip blob как `Uint8Array`.

### 1.4. Abyss и Go ReverseSearch

Для глаз 7–10 / Zorath расчёт уже идёт через LUT; Go `ReverseSearch` для них не должен быть «основным» путём (уже разводим на фронте).

**Идеи:**

- не тащить в WASM лишнюю логику/данные «как для круга», если Abyss-only пути живут в LUT;
- классический ReverseSearch — в **Worker** (сейчас main thread + crystalline тоже может подвешивать UI);
- кэш расчёта по seed уже есть в Go — проверить рост памяти при длинных поисках / ClearCache.

### 1.5. Пайплайн сборки WASM

- `prepare-wasm-data` / `build:possible-stats` — чеклист «что реально embed» vs «что только public»;
- size budget в `release-check`: fail если `calculator.wasm` > N MB;
- опционально `wasm-opt` / strip debug после `go build`.

---

## 2. Фронт — бандл TreeView (~7 MB)

### 2.1. Словари статов

В чанк дерева попадают, среди прочего:

- `statNamesByStringId.generated.ts` (~1.9 MB)
- `statStringToId.generated.ts` (~1.5 MB)
- `statTemplatesEnByStringId.generated.ts` (~1.1 MB)
- `statNamesRuReduced…`, `statIdByRuName…`, `passiveNames…`, `passiveSkillGraphIdToNameRu…`
- `passive_node_ru.json` (~655 KB)

Большая часть id — **не** timeless/abyss.

**Идеи:**

1. **Trim при `build:dict`:** только id из APS/APA/`possible_stats`/затронутых passive + их min/max пары.
2. Разделить «полный RePoE» (offline tooling) и «runtime dict» (маленький).
3. Lazy: EN templates / skeleton map грузить только если `lang === 'en'` или при фоллбеке.
4. `statStringToId` — не в начальный чанк; подгружать при редком пути «текст → id».

Ожидаемый эффект: TreeView JS с мегабайт → сотни KB словарей.

### 2.2. Code-splitting внутри дерева

Сейчас lazy только `TreeView` route; внутри — монолит `SkillTreeCanvas` + меню + поиск + dict.

**Идеи:**

- dynamic import: `SearchResultsList` / stats-mode тяжёлые куски;
- спрайты дерева уже с CDN — не дублировать atlas meta;
- canvas/tooltips не импортировать полный `dict`, а узкий `statFormat.ts`.

### 2.3. SkillTree источник истины

Дерево приходит из WASM-строки `data.SkillTree` → `JSON.parse` на клиенте.

**Идеи:**

- отдельный `SkillTree.json.gz` в `public/` (как abyss LUT): прогресс загрузки, кэш браузера, WASM без дерева;
- на клиенте хранить уже нужный subset (nodes/groups/sprites urls), выкинуть ruthlessness/alternate export если не используются.

### 2.4. Загрузка и UX

- явный phased loader: WASM → дерево → спрайты → ready (частично есть);
- не блокировать UI ReverseSearch (классика тоже в Worker; Abyss LUT — чанки, уже начато);
- Service Worker / long-cache для `calculator.wasm` и `abyss-affected/*.bin` (content hash в имени).

---

## 3. Abyss LUT (`public/abyss-affected` ~143 MB)

Уже хорошо: один файл на сокет / `zorath.bin`.

**Идеи дальше:**

- сильнее сжатие / другой layout (меньше копий APS key → только deltas);
- `seedInc > 1` если игра/PoB позволяет (сейчас 100…8000 step 1 → ~7901 сидов);
- индекс «statId → список seed» для reverse search вместо полного скана (огромный выигрыш CPU);
- prefetch только соседних сокетов / текущего jewel type, не все глаза;
- CDN cache headers + immutable filenames.

---

## 4. Логика приложения (не только размер)

### 4.1. Единый слой «affected nodes»

Сейчас круг / LUT / Zorath path / union без сида размазаны по `getAffectedNodes`, seed preview, reverse search, canvas.

**Идея:** один модуль `jewelArea.ts`: `{ mode: 'radius' | 'abyss-eye' | 'zorath', nodesForSeed?, nodesUnion }` — UI и поиск только его потребляют.

### 4.2. Единый формат стат-линий

Min/max (`{0}`/`{1}`) чинили в tooltip и search list отдельно.

**Идея:** единственный `formatPassiveStatLines(keys[], rolls[])` везде (seed list, tooltip, search, trade labels).

### 4.3. Reverse search

- Abyss: LUT scan → лучше **индекс** или Worker;
- classic: Worker + прогресс в прелоадер (сейчас `onProgress` почти пустой);
- не смешивать Go RNG и LUT для одних и тех же jewel types.

### 4.4. Данные и пайплайн

- `pipeline:refresh` уже тянет possible-stats — добавить trim-словари / trim-stats-for-wasm;
- документировать «что в WASM / что в public / что generated»;
- тесты на размер + smoke: Calculate / LUT tooltip / reverse search глаз.

---

## 5. Приоритеты (предложение)

| # | Работа | Эффект на загрузку | Сложность |
| --- | ---: | --- | --- |
| P0 | Trim runtime-словарей статов (`build:dict`) — **сделано** (TreeView ~7 MB → ~1.8 MB; `FULL_STAT_DICT=1` для полного) | TreeView JS сильно ↓ | средняя |
| P0 | Убрать SkillTree + translations (+ PossibleStats) из WASM → `public/data` | WASM ↓, TTI ↓ | средняя |
| P1 | Trim `stats` / passive rows в embed | WASM ↓ ещё | средняя |
| P1 | Worker для classic ReverseSearch + прогресс | UX, без зависаний | низкая–средняя |
| P1 | Индекс для Abyss reverse search | CPU поиска ↓ | высокая |
| P2 | Бинарный формат таблиц вместо JSON в Go | init WASM ↓ | высокая |
| P2 | Доп. split чанков TreeView / lazy EN dict | marginal | низкая |
| P2 | Оптимизация формата abyss `.bin` | трафик глаз ↓ | высокая |

---

## 6. Метрики успеха

- `calculator.wasm` < ~2–3 MB (цель-ориентир после выноса UI-данных).
- TreeView JS < ~1–1.5 MB gzip≈ ещё меньше.
- TTI дерева на среднем канале: WASM parse + first interactive без многосекундного freeze.
- Reverse search (Abyss): прелоадер виден сразу, UI отвечает; поиск < N с на типичном сокете.
- `npm run release:check` проверяет бюджеты размеров.

---

## 7. Что не трогать без нужды

- Корректность сидов / LUT глаз (лучше сжать/проиндексировать, чем «упростить» геометрию).
- Официальные тексты модов (trim словаря — только по используемым id, с тестом на регрессии `#` / min-max).

---

*Документ — рабочий бэклог идей, не спецификация. Имеет смысл идти сверху вниз по таблице приоритетов и мерить размеры после каждого шага.*
