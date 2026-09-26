# Бэклог улучшений

Рабочий список идей после trim словарей, PWA, выноса UI-данных из WASM и lazy EN-чанка.  
Детали по размерам/WASM — см. также [`optimization-plan.md`](./optimization-plan.md).

Статусы: `[ ]` идея · `[~]` в работе · `[x]` сделано.

---

## Сделано (кратко)

- [x] Trim runtime-словарей статов (`build:dict`)
- [x] PWA + `?v=` CacheFirst для wasm / abyss / `public/data`
- [x] SkillTree + EN translations + PossibleStats → `public/data` (`uiData.ts`)
- [x] Lazy EN-словари (`dictEn` chunk)
- [x] Militant Faith: attribute-small → +10 devotion; `IsSmallAttribute` по Id стата
- [x] Pinch-zoom на таче; UI loading/error через `ui()`
- [x] Справочник кейстоунов `/effects` (TreeNav → клик → jewel/conqueror; фильтр по тексту)
- [x] UX prefs: jewel/conqueror/socket в `localStorage`; пустой экран + примеры
- [x] Мобилка: bottom sheet (~78vh) + drag по высоте; тап = pin тултипа, long-press = действие
- [x] Тултип: кламп к краям viewport при пане; без `100vw` (гориз. скролл)
- [x] FAQ/копирайт: «кейстоун»; `index.html` `/wasm_exec.js` без двойного `/poe/poe/`

---

## 1. Производительность и размер

- [ ] **Trim `stats` / `passive_skills` в WASM** — оставить только ключи APS/APA/`possible_stats` (+ min/max). Главный остаток ~9 MB wasm.
- [ ] **Worker для classic ReverseSearch** + прогресс в прелоадере (легион не вешает UI).
- [ ] **Индекс Abyss reverse search** (`statId → seeds`) вместо полного скана LUT.
- [ ] Бинарный формат таблиц в Go вместо JSON-in-embed (init быстрее).
- [ ] `wasm-opt` / strip в `build-wasm.sh` + бюджет размера в `release:check`.
- [ ] Сильнее сжать / переложить `abyss-affected/*.bin` (меньше трафика глаз).

---

## 2. Регрессионные смоук-тесты данных (приоритет)

Цель: после патча / `pipeline:refresh` быстро убедиться, что сиды и тексты совпадают с игрой и удобно сверить с PoB / другими калькуляторами **вручную**.

### 2.1. Выборка кейсов

- [ ] Скрипт (Node или Go) собирает **рандомную, но воспроизводимую** выборку (seed RNG фиксируется флагом `--seed=…`):
  - разные **типы самоцветов** (1–6 легион, 7–10 глаза, 11 Zorath);
  - разные **завоеватели / личи**;
  - разные **сокеты** (и class/ascendancy для Zorath);
  - разные **типы нод**: attribute-small, normal-small, notable, keystone (где применимо);
  - для Militant Faith — отдельно attribute vs non-attribute small.
- [ ] На каждый кейс: `Calculate` (или LUT для глаз) → список затронутых skill id + сырые StatsKeys/роллы.

### 2.2. Человекочитаемый отчёт

- [ ] Вывод в Markdown/HTML (например `artifacts/smoke-report.md`), на кейс:
  - jewel / conqueror / seed / socket (и ссылка на `/tree?…` в нашем UI);
  - имя ноды (RU + EN);
  - строки эффекта **как в тултипе** (через тот же `formatLinesFromStatKeys` / dict), не сырые slug’и;
  - пометка replace vs addition;
  - для Abyss — источник LUT vs WASM.
- [ ] Режим `--compare-baseline=path`: diff с прошлым отчётом (новые/пропавшие/изменившиеся строки).
- [ ] CI или локальный хук: `npm run test:smoke-data` после `pipeline:refresh` / перед релизом; fail при расхождении с закоммиченным baseline (или warn + артефакт).

### 2.3. Ручная сверка с конкурентами

- [ ] В отчёте — чеклист «сверить вручную» (5–10 кейсов из выборки), без автоматического скрапинга чужих сайтов.
- [ ] Короткая инструкция: открыть наш URL → открыть PoB / другой калькулятор с теми же jewel/seed/socket → сравнить текст ноды.
- [ ] Опционально: зафиксировать скрин/заметку в PR при обновлении данных патча.

### 2.4. Минимальный набор «золотых» кейсов

Помимо рандома — маленький **фиксированный** набор известных кейсов (чтобы ловить регрессии вроде MF +int → devotion, Power of Purpose перевод, min/max fire damage `#`):

- [ ] JSON/YAML фикстуры с ожидаемыми строками тултипа;
- [ ] unit/smoke: прогон Calculate + форматтер → assert на строки.

---

## 3. Данные и пайплайн

- [ ] Документировать «что в WASM / что в `public/data` / что generated» (одна таблица в README или `docs/data-layout.md`).
- [ ] `pipeline:refresh` всегда синкает `public/data` + пересобирает dict trim + smoke-тесты из §2.
- [ ] Версионирование abyss LUT вместе с `package.json` / `?v=` (уже частично) + заметка в changelog деплоя «данные патча X».
- [ ] Проверка: после обновления GGPK/PoB нет stub’ов `passive_skills` без нужды (`release:check` уже частично смотрит).

---

## 4. UX / продукт

- [ ] Прогресс загрузки дерева: фазы WASM / UI data / sprites (сейчас общий «Almost ready»).
- [ ] Баннер «доступна новая версия» при обновлении SW (сейчас autoUpdate без UI).
- [x] Сохранять последний jewel/socket/lang в `localStorage` (`treePrefs` + i18n).
- [x] Пустой экран: подсказка + примеры; подсветка сокетов до выбора.
- [x] Мобильное меню: sheet снизу, drag высоты, свайп открыть/закрыть; по умолчанию свёрнуто.
- [x] Тач-тултип: тап pin / повторный тап или пустое место — снять; long-press = клик (сокет/disable).
- [x] Фильтр по тексту на `/effects`.
- [ ] Экспорт/шаринг пресета поиска (stats mode) одной ссылкой.
- [ ] Более явный preloader + отмена для длинного reverse search.
- [ ] Сравнение двух сидов (diff нод в радиусе).
- [ ] «Любимые» / недавние сиды в меню.
- [ ] Готовые пресеты поиска (например MF devotion).
- [ ] С `/effects` сразу в stats-mode с выбранным статом (если однозначен).
- [ ] Кнопка «скопировать всё» (trade + jewel/conqueror/seed/socket текстом).
- [ ] Карточка «что даёт сид»: кейстоун + топ notables без наведения на каждую ноду.

### 4.1. Справочник эффектов крупных нод (keystone / notable)

- [x] Страница `/effects` (только TreeNav, не Home): кейстоуны 1–10.
- [x] RU/EN, группировка jewel → conqueror/lich; клик → `/tree?jewel=&conqueror=`.
- [x] `build:keystone-catalog` → `keystoneCatalog.json`; в `pipeline:refresh`.
- [x] Фильтр по имени/эффекту.
- [ ] Ключевые notables (MF devotion thresholds и т.п.) — второй слой.
- [ ] Опционально: подсветка/фильтр по связанному stat id в калькуляторе.

---

## 5. Качество кода и сопровождение

- [ ] Единый слой `jewelArea` (radius / abyss-eye / zorath) — меньше разброса в canvas / search / preview.
- [ ] Единый `formatPassiveStatLines` везде (tooltip, seed list, search, trade).
- [ ] Убрать мёртвые RU-blobs из `data/` пайплайна, если больше нигде не нужны.
- [ ] Типизировать `WasmData` / результаты Calculate жёстче (меньше `unknown`).

---

## 6. Приоритеты (предложение)

| # | Что | Зачем | Сложность |
| --- | --- | --- | --- |
| 1 | Смоук-выборка + человекочитаемый отчёт (§2) | Уверенность после патчей, сверка с конкурентами | средняя |
| 2 | Trim stats в WASM | Главный минус к загрузке wasm | средняя |
| 3 | Notables в `/effects` + пресеты поиска (§4 / §4.1) | Добить справочник и быстрый старт билда | средняя |
| 4 | Worker classic ReverseSearch | UX без freeze | низкая–средняя |
| 5 | Фиксированные «золотые» фикстуры тултипов | Ловят конкретные баги вроде MF/devotion | низкая |
| 6 | Прогресс loader / SW banner / отмена поиска | Полировка | низкая |

---

*Документ — бэклог идей, не спецификация. Имеет смысл идти сверху таблицы и мерить размеры / гонять smoke после каждого шага.*
