/**
 * Скачивает страницу дерева пассивов (RU), извлекает passiveSkillTreeData
 * и сохраняет tree, nodes, groups, classes, alternate_ascendancies в JSON.
 * Запуск: npm run fetch:passive-tree-ru  или  node scripts/fetch-passive-tree-ru.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../src/temp/ru");
const OUT_FILE = join(OUT_DIR, "passive_skill_tree_ru.json");
const URL = "https://ru.pathofexile.com/passive-skill-tree";

/**
 * Найти конец JSON-объекта: от первой { после маркера до парной }.
 * Учитываем строки в "...", экранирование \ и вложенные скобки.
 */
function extractJsonObject(html, startMarker) {
  const idx = html.indexOf(startMarker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx + startMarker.length);
  if (start === -1) return null;
  let depth = 0;
  let inString = null;
  let escape = false;
  let i = start;
  while (i < html.length) {
    const c = html[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      i++;
      continue;
    }
    if (inString) {
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      i++;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
    i++;
  }
  return null;
}

async function main() {
  console.log("Fetching", URL, "...");
  const res = await fetch(URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${URL}`);
  const html = await res.text();

  const marker = "passiveSkillTreeData = ";
  const jsonStr = extractJsonObject(html, marker);
  if (!jsonStr) throw new Error("passiveSkillTreeData not found or invalid in HTML");

  const data = JSON.parse(jsonStr);
  mkdirSync(OUT_DIR, { recursive: true });

  const output = {
    tree: data.tree,
    nodes: data.nodes || {},
    groups: data.groups || {},
    classes: data.classes || [],
    alternate_ascendancies: data.alternate_ascendancies || [],
  };
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), "utf8");
  const nodeCount = Object.keys(output.nodes).length;

  // Лёгкий словарь: только skill → { name, stats } для перевода в тултипах
  const light = {};
  for (const node of Object.values(output.nodes)) {
    const skill = node.skill;
    if (skill == null) continue;
    light[skill] = {
      name: node.name ?? "",
      stats: Array.isArray(node.stats) ? node.stats : [],
    };
  }
  const lightPath = join(OUT_DIR, "passive_node_ru.json");
  writeFileSync(lightPath, JSON.stringify(light), "utf8");
  console.log(`Fetched ${nodeCount} nodes → ${OUT_FILE}`);
  console.log(`Lightweight ${Object.keys(light).length} entries → ${lightPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
