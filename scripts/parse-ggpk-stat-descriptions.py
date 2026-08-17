#!/usr/bin/env python3
"""
Parse GGG Metadata/StatDescriptions/*.txt (UTF-16-LE) into go-pob-style JSON.

Input files are extracted from Content.ggpk via PyPoE FileSystem.
Default language block (before any `lang "..."`) = English.
`lang "Russian"` blocks = RU.

Usage:
  python3 scripts/parse-ggpk-stat-descriptions.py \\
    --src /path/to/passive_skill_stat_descriptions.txt \\
    --out-en data/passive_skill_stat_descriptions.json \\
    --out-ru data/passive_skill_stat_descriptions_ru.json \\
    --out-repoe-ru src/temp/ru/passive_skill.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def decode_bytes(data: bytes) -> str:
    if data.startswith(b"\xff\xfe") or data.startswith(b"\xfe\xff"):
        return data.decode("utf-16")
    # Some extracts already stripped BOM but stay UTF-16-LE
    if b"\x00" in data[:64]:
        try:
            return data.decode("utf-16-le")
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", errors="replace")


def parse_handlers(tail: str) -> dict[str, str]:
    """Parse trailing tokens after the quoted string, e.g. reminderstring ReminderTextX."""
    handlers: dict[str, str] = {}
    parts = tail.split()
    i = 0
    while i < len(parts):
        key = parts[i]
        if i + 1 < len(parts):
            handlers[key] = parts[i + 1]
            i += 2
        else:
            handlers[key] = "1"
            i += 1
    return handlers


_STRING_RE = re.compile(r'^#\s*"(.*)"\s*(.*)$')


def parse_string_line(line: str) -> tuple[str, dict[str, str]] | None:
    # Tabs/spaces before #
    s = line.lstrip(" \t")
    m = _STRING_RE.match(s)
    if not m:
        return None
    # Unescape \" and keep \n as real newlines for JSON (json.dumps will escape)
    raw = m.group(1).replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t")
    handlers = parse_handlers(m.group(2).strip()) if m.group(2).strip() else {}
    return raw, handlers


def parse_stat_descriptions(text: str) -> tuple[list[dict], list[str]]:
    """
    Returns (blocks, includes).
    Each block: {"ids": [...], "en": [{"string", "index_handlers"?}], "ru": [...]}
    """
    includes: list[str] = []
    blocks: list[dict] = []

    lines = text.splitlines()
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i].strip()
        if line.startswith("include "):
            m = re.search(r'include\s+"([^"]+)"', line)
            if m:
                includes.append(m.group(1))
            i += 1
            continue

        if line != "description":
            i += 1
            continue

        i += 1
        if i >= n:
            break

        # ids line: <count> id1 id2 ...
        ids_line = lines[i].strip()
        i += 1
        parts = ids_line.split()
        if not parts:
            continue
        try:
            count = int(parts[0])
            ids = parts[1 : 1 + count]
        except ValueError:
            # fallback: all tokens are ids
            ids = parts
        if not ids:
            continue

        en_variants: list[dict] = []
        ru_variants: list[dict] = []
        current_lang = "English"  # default block
        pending_count: int | None = None

        while i < n:
            raw_line = lines[i]
            stripped = raw_line.strip()
            if stripped == "description":
                break
            if not stripped:
                i += 1
                continue

            lang_m = re.match(r'^lang\s+"([^"]+)"\s*$', stripped)
            if lang_m:
                current_lang = lang_m.group(1)
                pending_count = None
                i += 1
                continue

            # Variant count line (single integer)
            if re.fullmatch(r"\d+", stripped):
                pending_count = int(stripped)
                i += 1
                continue

            parsed = parse_string_line(raw_line)
            if parsed:
                string, handlers = parsed
                entry: dict = {"string": string}
                if handlers:
                    entry["index_handlers"] = handlers
                if current_lang == "Russian":
                    ru_variants.append(entry)
                elif current_lang in ("English", "English (US)", ""):
                    en_variants.append(entry)
                # ignore other languages
                i += 1
                continue

            # Unknown line inside block — skip
            i += 1

        blocks.append({"ids": ids, "en": en_variants, "ru": ru_variants})

    return blocks, includes


def to_gopob(blocks: list[dict], includes: list[str], lang: str) -> dict:
    descriptors = []
    for b in blocks:
        variants = b["en"] if lang == "en" else b["ru"]
        if not variants:
            # RU file often falls back to EN for missing translations
            variants = b["en"] if lang == "ru" else []
        if not variants:
            continue
        descriptors.append({"ids": b["ids"], "list": variants})
    return {"descriptors": descriptors, "includes": includes}


def to_repoe_ru(blocks: list[dict]) -> list[dict]:
    out = []
    for b in blocks:
        variants = b["ru"] or b["en"]
        if not variants:
            continue
        russian = []
        for v in variants:
            item = {
                "condition": [{"min": None, "max": None, "negated": None}],
                "format": ["ignore"],
                "index_handlers": [[]],
                "string": v["string"],
            }
            handlers = v.get("index_handlers") or {}
            if "reminderstring" in handlers:
                # build-dict uses reminder_text with parentheses sometimes
                item["reminder_text"] = f"({handlers['reminderstring']})"
            russian.append(item)
        out.append(
            {
                "ids": b["ids"],
                "English": None,
                "Russian": russian,
                "trade_stats": None,
                "hidden": None,
            }
        )
    return out


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def write_json_gz(path: Path, obj) -> None:
    import gzip

    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    path.write_bytes(gzip.compress(raw, compresslevel=9))
    # also plain .json next to .gz if path ends with .gz
    if path.suffix == ".gz":
        plain = path.with_suffix("")
        plain.write_bytes(raw)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="Path to extracted .txt (UTF-16)")
    ap.add_argument("--out-en", help="go-pob EN JSON (optional .gz)")
    ap.add_argument("--out-ru", help="go-pob RU JSON (optional .gz)")
    ap.add_argument("--out-repoe-ru", help="RePoE-like array for src/temp/ru/passive_skill.json")
    ap.add_argument("--include-name", default="", help="Force includes entry (ggpk path)")
    args = ap.parse_args()

    src = Path(args.src)
    text = decode_bytes(src.read_bytes())
    blocks, includes = parse_stat_descriptions(text)
    if args.include_name and args.include_name not in includes:
        includes = [args.include_name, *includes]

    print(f"parsed {len(blocks)} description blocks from {src.name}")
    abyss = sum(1 for b in blocks if any("abyss" in i for i in b["ids"]))
    print(f"  of which ids containing 'abyss': {abyss}")

    if args.out_en:
        out = Path(args.out_en)
        obj = to_gopob(blocks, includes, "en")
        if out.suffix == ".gz":
            write_json_gz(out, obj)
        else:
            write_json(out, obj)
            write_json_gz(Path(str(out) + ".gz"), obj)
        print(f"  wrote EN descriptors={len(obj['descriptors'])} -> {out}")

    if args.out_ru:
        out = Path(args.out_ru)
        obj = to_gopob(blocks, includes, "ru")
        if out.suffix == ".gz":
            write_json_gz(out, obj)
        else:
            write_json(out, obj)
            write_json_gz(Path(str(out) + ".gz"), obj)
        print(f"  wrote RU descriptors={len(obj['descriptors'])} -> {out}")

    if args.out_repoe_ru:
        out = Path(args.out_repoe_ru)
        arr = to_repoe_ru(blocks)
        write_json(out, arr)
        print(f"  wrote RePoE RU entries={len(arr)} -> {out}")


if __name__ == "__main__":
    main()
