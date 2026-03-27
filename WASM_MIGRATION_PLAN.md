# WASM Migration Plan (poe folder)

Цель: отвязать фронтенд в `poe/` от внешнего backend-пайплайна и перейти на собственную сборку `calculator.wasm` + собственное обновление данных на базе официального экспорта дерева.

## Источник данных (новый базовый)

Основной источник структуры дерева PoE 1:
- [grindinggear/skilltree-export](https://github.com/grindinggear/skilltree-export)
  - [data.json](https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json)
  - [alternate.json](https://raw.githubusercontent.com/grindinggear/skilltree-export/master/alternate.json)
  - при необходимости: `ruthless.json`, `ruthless-alternate.json`

Почему это базовый источник:
- официальный экспорт GGG;
- структура дерева актуализируется вместе с релизами;
- предсказуемый формат для автоматизации обновлений.

## Архитектурное решение

Оставляем WASM как вычислительный движок (Calculate/индексы/статы), но полностью переносим data-pipeline в `poe/`:
- входные JSON скачиваем собственными скриптами;
- генерацию промежуточных словарей делаем локально;
- компиляцию wasm запускаем из `poe`-пайплайна;
- фронт использует только локально собранные артефакты (`public/` + `src/lib/*.generated.ts`).

## Этапы переноса

### Этап 1. Зафиксировать контракт данных для WASM

1. Выписать минимальный набор, который реально нужен Go-калькулятору:
   - структура нод/групп/орбит;
   - маппинги stat id/index;
   - alternate-данные для timeless-расчётов.
2. Зафиксировать это в `poe/docs/wasm-data-contract.md`.
3. Добавить smoke-тест: проверка, что скачанные JSON содержат обязательные поля.

## Этап 2. Создать независимые fetch-скрипты в `poe/scripts`

Скрипты (Node):
1. `fetch-skilltree-export.mjs`
   - качает `data.json`, `alternate.json` (и ruthless при необходимости);
   - пишет в `poe/src/temp/en/skilltree-export/`.
2. `fetch-ru-passive-tree.mjs`
   - качает `https://ru.pathofexile.com/passive-skill-tree`;
   - извлекает `passiveSkillTreeData`;
   - пишет:
     - `poe/src/temp/ru/passive_skill_tree_ru.json` (полный)
     - `poe/src/temp/ru/passive_node_ru.json` (лёгкий словарь `skillId -> {name, stats}`).
3. `fetch-alternate-names-ru.mjs` (fallback для alt-нод) — сохранить, но сделать отдельным опциональным шагом.

## Этап 3. Перенести Go build-пайплайн внутрь `poe/`

1. Добавить `poe/wasm/` (или `poe/go/wasm/`) с Go-калькулятором.
2. Добавить скрипт `poe/scripts/build-wasm.sh`:
   - `GOOS=js GOARCH=wasm go build ... -o poe/public/calculator.wasm`.
3. Добавить npm-команды в `poe/package.json`:
   - `data:fetch`
   - `data:prepare`
   - `wasm:build`
   - `pipeline:refresh` (полный цикл).

## Этап 4. Data prepare (между fetch и wasm build)

Сделать `poe/scripts/prepare-wasm-data.mjs`:
- нормализует поля из `skilltree-export` под формат, который ожидает Go-код;
- строит недостающие индексы/карты;
- пишет итоговые файлы в `poe/data/` (вход для `go:embed`).

## Этап 5. Словари фронтенда (TS generated)

1. Оставить текущий генератор словарей, но источники переключить на локальные temp-файлы из `poe/`.
2. Стабилизировать output:
   - `src/lib/statNamesByStringId.generated.ts`
   - `src/lib/statTemplatesEnByStringId.generated.ts`
   - `src/lib/passiveSkillGraphIdToNameRu.generated.ts`
   - и другие generated-файлы.
3. Добавить контроль версии источников в метаданные генерации (commit hash, дата).

## Этап 6. Проверка эквивалентности (очень важно)

Сделать тесты сравнения старого и нового пайплайна:
1. Набор эталонных кейсов (jewel + conqueror + seed + node).
2. Сравнение результатов `Calculate` по ключевым полям.
3. Сравнение отображаемых строк в tooltip (RU/EN) для известных проблемных нод.
4. Допускать различия только там, где источники реально изменились.

## Этап 7. Убрать legacy-зависимости

После прохождения тестов:
1. удалить запросы к старому backend-источнику в runtime;
2. удалить временные fallback ветки, завязанные на старую структуру;
3. оставить один путь обновления: `pipeline:refresh`.

## Этап 8. CI/автообновление

1. GitHub Actions (или иной CI):
   - nightly/manual job;
   - fetch -> prepare -> wasm build -> dict build -> smoke tests.
2. При изменениях источников:
   - автокоммит обновлённых generated/data файлов;
   - changelog с датой и commit источника.

## Минимальный MVP (что сделать первым)

1. `fetch-skilltree-export.mjs` + `fetch-ru-passive-tree.mjs`.
2. `prepare-wasm-data.mjs` (минимальный под текущий Go).
3. `wasm:build` из `poe/`.
4. 10-20 golden test-кейсов для `Calculate`.

Если это проходит — можно полностью отключать старый data backend.

## Риски и как снизить

- Изменения формата `skilltree-export` между лигами:
  - обязательная schema-проверка + fail-fast.
- Расхождения в RU переводах:
  - официальный RU tree как source of truth для обычных нод.
- Альтернативные ноды без официального RU-источника:
  - fallback словарь + отдельный валидатор покрытия.
- Рост сложности пайплайна:
  - один входной скрипт `pipeline:refresh` и детерминированные артефакты.

## Definition of Done

Проект в `poe/` считается полностью автономным, когда:
1. `npm run pipeline:refresh` в чистом окружении формирует все нужные артефакты;
2. `npm run build` использует только локально подготовленные данные;
3. в runtime нет запросов к старому backend для критичной логики расчёта;
4. golden-тесты проходят на целевом наборе seed/jewel/node кейсов.
