#!/usr/bin/env python3
"""Rebuild data/possible_stats.json(.gz) from alternate_passive_skills + additions.

Weights are SpawnWeight sums (rarity sort). Classic jewels (1–6) omit keystones;
Abyss (7+) keep them. Stats._key can drift between game patches — regenerate
after refreshing APS/APA so the stats-mode select stays aligned.
"""

from __future__ import annotations

import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
KEYSTONE = 4


def load_json(name: str):
    gz = DATA / f"{name}.json.gz"
    raw = DATA / f"{name}.json"
    if gz.exists():
        return json.loads(gzip.decompress(gz.read_bytes()))
    if raw.exists():
        return json.loads(raw.read_text(encoding="utf-8"))
    raise FileNotFoundError(f"missing {gz} / {raw}")


def rebuild(aps: list, apa: list) -> dict[int, dict[int, int]]:
    out: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for row in aps:
        atv = row.get("AlternateTreeVersionsKey")
        if not atv:
            continue
        pts = row.get("PassiveType") or []
        if KEYSTONE in pts and atv < 7:
            continue
        w = int(row.get("SpawnWeight") or 0)
        if w <= 0:
            continue
        for sk in row.get("StatsKeys") or []:
            out[atv][int(sk)] += w
    for row in apa:
        atv = row.get("AlternateTreeVersionsKey")
        if not atv:
            continue
        w = int(row.get("SpawnWeight") or 0)
        if w <= 0:
            continue
        for sk in row.get("StatsKeys") or []:
            out[atv][int(sk)] += w
    return {k: dict(v) for k, v in out.items()}


def merge_weights(
    fresh: dict[int, dict[int, int]],
    previous: dict[str, dict[str, int]] | None,
) -> dict[str, dict[str, int]]:
    """Keep prior simulation weights when the key set is unchanged (Abyss)."""
    result: dict[str, dict[str, int]] = {}
    for atv, weights in sorted(fresh.items()):
        key = str(atv)
        prev = previous.get(key) if previous else None
        if prev is not None and set(map(int, prev)) == set(weights):
            result[key] = {str(k): int(prev[str(k)]) for k in weights}
        else:
            result[key] = {str(k): int(w) for k, w in sorted(weights.items())}
    return result


def main() -> int:
    aps = load_json("alternate_passive_skills")
    apa = load_json("alternate_passive_additions")
    prev = None
    prev_path = DATA / "possible_stats.json.gz"
    if prev_path.exists():
        prev = json.loads(gzip.decompress(prev_path.read_bytes()))

    merged = merge_weights(rebuild(aps, apa), prev)

    out_json = DATA / "possible_stats.json"
    out_gz = DATA / "possible_stats.json.gz"
    payload = json.dumps(merged, ensure_ascii=False, separators=(",", ":"))
    out_json.write_text(payload + "\n", encoding="utf-8")
    with gzip.open(out_gz, "wb", compresslevel=9) as f:
        f.write(payload.encode("utf-8"))

    for j, stats in merged.items():
        print(f"jewel {j}: {len(stats)} stats")
    print(f"wrote {out_json.relative_to(ROOT)} and {out_gz.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
