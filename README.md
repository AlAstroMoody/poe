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
- `npm run fetch:go-pob-data` — скачать raw/translation файлы для Go/WASM (с fallback по версиям).
- `npm run fetch:passive-tree-ru` — подтянуть русские названия нод пассивного дерева.
- `npm run fetch:alternate-names` — подтянуть альтернативные названия нод под самоцветы.
- `npm run build:dict` — пересобрать словарь переводов статов.
- `npm run prepare:wasm-data` — обновить `SkillTree.json(.gz)` и провалидировать `data/*.json.gz` для `go:embed`.
- `npm run sync:vilsol-wasm-data` — скачать расчётные `data/*.json.gz` с [Vilsol/timeless-jewels](https://github.com/Vilsol/timeless-jewels) (как на vilsol.github.io); затем `prepare:wasm-data` и `wasm:build`.
- `npm run wasm:build` — собрать `public/calculator.wasm` локально из Go-кода в `poe/`.
- `npm run pipeline:refresh` — регулярный цикл обновления данных и пересборки wasm (без долгого PoEDB шага).
- `npm run pipeline:refresh:full` — полный цикл, включая `fetch:alternate-names`.

Без них приложение уже работает, но часть текста будет на английском.

## Деплой

Настроен выкладка на GitHub Pages через `npm run deploy` (ветка `gh-pages`, папка `dist`).

---

Лицензия и авторство — по желанию; данные игры — у GGG, логика расчётов — у авторов timeless-jewels.

## Новый pipeline данных/WASM

В `poe/` добавлен автономный pipeline (этап миграции):

- `npm run fetch:skilltree-export` — скачать официальные данные дерева PoE1 из `grindinggear/skilltree-export` (`data.json`, `alternate.json`, `ruthless*.json`) в `src/temp/en/skilltree-export/`.
- `npm run prepare:wasm-data` — обновить реальные входы для Go/WASM в `data/` (в т.ч. `SkillTree.json` + `SkillTree.json.gz` из официального `skilltree-export/data.json`) и провалидировать обязательные `*.json.gz` для `go:embed`.
- `npm run wasm:build` — собрать `public/calculator.wasm`.
- `npm run pipeline:refresh` — полный цикл: fetch + RU словари + dict + prepare + wasm build.

### Важно (текущий этап миграции)

`wasm:build` собирает `public/calculator.wasm` только из локальных Go-исходников внутри `poe/` (`go.mod`, `wasm/`, `calculator/`, `data/`, `random/`).

Fallback на родительский репозиторий удалён: теперь сборка детерминирована и автономна в рамках `poe/`.


## Источник WASM

Эталонный веб-интерфейс той же логики расчётов (репозиторий [Vilsol/timeless-jewels](https://github.com/Vilsol/timeless-jewels)): **[timeless-jewels на GitHub Pages](https://vilsol.github.io/timeless-jewels)**. По нему удобно сверять сид, тип камня, завоевателя и ноду: если там совпадает с игрой, а у нас нет — искать расхождение в наших данных/сборке WASM; если и там не как в клиенте — ограничение общей реализации или версии дампов.

По умолчанию приложение загружает WASM локально: `/calculator.wasm` (из `public/`).

Опционально можно задать удалённый fallback через env:

```bash
VITE_DATA_URL=https://example.com npm run dev
```

Тогда при неудаче локальной загрузки будет попытка взять `${VITE_DATA_URL}/calculator.wasm`.

### Если альтернативы под самоцвет не совпадают с игрой / [vilsol.github.io](https://vilsol.github.io/timeless-jewels)

1. Подтянуть те же `data/*.json.gz`, что в [Vilsol/timeless-jewels](https://github.com/Vilsol/timeless-jewels): `npm run sync:vilsol-wasm-data`, затем `npm run prepare:wasm-data && npm run wasm:build`.
2. В тултипе строка «⚠ Заглушка passive_skills» значит: для ноды в дереве нет полной строки в экспорте PoB, скрипт добавил заглушку — расчёт может отличаться; обнови дампы (п.1) и при необходимости `npm run fetch:go-pob-data`.
