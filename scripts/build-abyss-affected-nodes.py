#!/usr/bin/env python3
"""Build Abyss timeless jewel LUTs from PoB data.

Jewel types 7–10 (eyes): public/abyss-affected/<jewelType>/<socketId>.bin (ABY2 gzip).
Jewel type 11 (Zorath): public/abyss-affected/11/zorath.bin (ZOR1 gzip).

Component IDs are resolved to our alternate_passive_skills / additions `_key`
via PoB LegionPassives + NodeIndexMapping.

Rebuild:
  npm run build:abyss-affected                  # eyes 7–10
  python3 scripts/build-abyss-affected-nodes.py --jewels 7 8 9 10 11

Frontend (lazy-load, one file per selection):
  src/lib/abyssAffectedNodes.ts
  src/lib/zorathPath.ts  (BFS socket → class start for Zorath highlight)

Deploy note: files under public/ are copied verbatim into dist/ by Vite.
Runtime only fetches the selected socket (or zorath.bin), not the whole tree.

--- ABY2 (per socket, little-endian, then gzip) ---
  'ABY2' u32
  seedMin u16, seedMax u16, seedInc u16
  socketId u16, jewelType u8, abyssSize u8
  for each seed in [seedMin..seedMax] step seedInc:
    nodeCount u8
    repeated nodeCount:
      nodeId u16
      resolved mod (below)

--- ZOR1 (single file, little-endian, then gzip) ---
  'ZOR1' u32
  seedMin u16, seedMax u16, seedInc u16
  nodeCount u16, ascsOffset u32
  index[nodeCount]: nodeId u16, modsRel u32  (offset from mods base)
  mods region: per node, seedCount consecutive resolved mods
  at ascsOffset: 'ASCS' + ascendancy name → per-seed notable picks

--- resolved mod ---
  compCount u8
  repeated: kind u8 (1=APS, 2=APA), key u16 (_key), rollCount u8, rolls i16*
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import struct
import sys
import urllib.request
import zlib
from pathlib import Path

POB_RAW = (
    "https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding/"
    "dev/src/Data/TimelessJewelData"
)
PART_COUNT = 6
MAGIC = b"ABY2"

JEWEL_FILES = {
    7: "AbyssTecrod",
    8: "AbyssUlaman",
    9: "AbyssKurgal",
    10: "AbyssAmanamu",
    11: "AbyssZorath",
}

TIMELESS_JEWEL_ADDITIONS = 337  # PoB data.timelessJewelAdditions
ZORATH_MAGIC = b"ZOR1"


def download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.stat().st_size > 0:
        return
    print(f"download {url}", flush=True)
    urllib.request.urlretrieve(url, path)


def download_jewel_parts(cache_dir: Path, name: str) -> bytes:
    chunks: list[bytes] = []
    for i in range(PART_COUNT):
        part = cache_dir / f"{name}.zip.part{i}"
        download(f"{POB_RAW}/{name}.zip.part{i}", part)
        chunks.append(part.read_bytes())
    return b"".join(chunks)


def load_json(path: Path):
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw)


def parse_legion_tables(legion_path: Path) -> tuple[dict[int, str], dict[int, str]]:
    """Return (nodes_by_1based_index, additions_by_1based_index) -> id string."""
    text = legion_path.read_text(encoding="utf-8", errors="replace")
    nodes_start = text.find('["nodes"]')
    add_start = text.find('["additions"]')
    if nodes_start < 0 or add_start < 0:
        raise RuntimeError("LegionPassives.lua missing nodes/additions")
    add_text = text[add_start:nodes_start]
    nodes_text = text[nodes_start:]

    def parse_section(section: str) -> dict[int, str]:
        out: dict[int, str] = {}
        for m in re.finditer(
            r"\[(\d+)\]\s*=\s*\{(.*?)\n\t\t\},",
            section,
            re.S,
        ):
            idx = int(m.group(1))
            block = m.group(2)
            id_m = re.search(r'\["id"\]\s*=\s*"([^"]+)"', block)
            if id_m:
                out[idx] = id_m.group(1)
        return out

    nodes = parse_section(nodes_text)
    additions = parse_section(add_text)
    print(f"legion nodes={len(nodes)} additions={len(additions)}", flush=True)
    return nodes, additions


def parse_local_id_maps(mapping_path: Path) -> dict[int, dict[int, int]]:
    text = mapping_path.read_text(encoding="utf-8", errors="replace")
    out: dict[int, dict[int, int]] = {}
    for jewel in range(1, 12):
        nxt = jewel + 1
        if jewel < 11:
            pat = (
                rf'localIdToGlobalId"\]\[{jewel}\](.*?)'
                rf'localIdToGlobalId"\]\[{nxt}\]'
            )
        else:
            pat = rf'localIdToGlobalId"\]\[{jewel}\](.*)$'
        m = re.search(pat, text, re.S)
        if not m:
            continue
        out[jewel] = {
            int(a): int(b) for a, b in re.findall(r"\[(\d+)\]\s*=\s*(\d+)", m.group(1))
        }
    return out


def skip_mod(raw: bytes, offset: int) -> int:
    component_count = raw[offset]
    offset += 1
    for _ in range(component_count):
        stat_count = raw[offset + 2]
        offset += 3 + stat_count * 2
    return offset


def read_mod(raw: bytes, offset: int) -> tuple[list[tuple[int, int, list[int]]], int]:
    component_count = raw[offset]
    offset += 1
    comps: list[tuple[int, int, list[int]]] = []
    for _ in range(component_count):
        ctype = raw[offset]
        local_id = raw[offset + 1]
        stat_count = raw[offset + 2]
        offset += 3
        rolls: list[int] = []
        for _ in range(stat_count):
            r = struct.unpack_from("<H", raw, offset)[0]
            offset += 2
            if r >= 32768:
                r -= 65536
            rolls.append(r)
        comps.append((ctype, local_id, rolls))
    return comps, offset


def resolve_component(
    jewel_type: int,
    ctype: int,
    local_id: int,
    local_maps: dict[int, dict[int, int]],
    legion_nodes: dict[int, str],
    legion_adds: dict[int, str],
    aps_by_id: dict[str, int],
    apa_by_id: dict[str, int],
) -> tuple[int, int] | None:
    """Return (kind, _key) where kind 1=APS replace, 2=APA addition."""
    mapped = local_maps.get(jewel_type, {}).get(local_id, local_id)
    if ctype == 1:
        node_idx = mapped + 1 - TIMELESS_JEWEL_ADDITIONS
        sid = legion_nodes.get(node_idx)
        if not sid:
            return None
        key = aps_by_id.get(sid)
        if key is None:
            return None
        return (1, key)
    if ctype == 2:
        add_idx = mapped + 1
        sid = legion_adds.get(add_idx)
        if not sid:
            return None
        key = apa_by_id.get(sid)
        if key is None:
            return None
        return (2, key)
    return None


def build_socket_blob(
    jewel_type: int,
    seed_min: int,
    seed_max: int,
    seed_inc: int,
    socket_id: int,
    abyss_size: int,
    seed_records: list[list[tuple[int, list[tuple[int, int, list[int]]]]]],
) -> bytes:
    out = bytearray()
    out += MAGIC
    out += struct.pack("<HHH", seed_min, seed_max, seed_inc)
    out += struct.pack("<H", socket_id)
    out.append(jewel_type & 0xFF)
    out.append(abyss_size & 0xFF)
    for nodes in seed_records:
        if len(nodes) > 255:
            raise ValueError(f"too many nodes socket={socket_id}")
        out.append(len(nodes))
        for node_id, comps in nodes:
            out += struct.pack("<H", node_id)
            if len(comps) > 255:
                raise ValueError("too many components")
            out.append(len(comps))
            for kind, key, rolls in comps:
                out.append(kind & 0xFF)
                out += struct.pack("<H", key)
                if len(rolls) > 255:
                    raise ValueError("too many rolls")
                out.append(len(rolls))
                for r in rolls:
                    out += struct.pack("<h", r)
    return bytes(out)


def write_resolved_mod(
    out: bytearray,
    comps_raw: list[tuple[int, int, list[int]]],
    jewel_type: int,
    local_maps: dict[int, dict[int, int]],
    legion_nodes: dict[int, str],
    legion_adds: dict[int, str],
    aps_by_id: dict[str, int],
    apa_by_id: dict[str, int],
) -> int:
    """Append one resolved modification; return unresolved component count."""
    unresolved = 0
    comps: list[tuple[int, int, list[int]]] = []
    for ctype, local_id, rolls in comps_raw:
        resolved = resolve_component(
            jewel_type,
            ctype,
            local_id,
            local_maps,
            legion_nodes,
            legion_adds,
            aps_by_id,
            apa_by_id,
        )
        if resolved is None:
            unresolved += 1
            continue
        kind, key = resolved
        comps.append((kind, key, rolls))
    if len(comps) > 255:
        raise ValueError("too many components")
    out.append(len(comps))
    for kind, key, rolls in comps:
        out.append(kind & 0xFF)
        out += struct.pack("<H", key)
        if len(rolls) > 255:
            raise ValueError("too many rolls")
        out.append(len(rolls))
        for r in rolls:
            out += struct.pack("<h", r)
    return unresolved


def process_zorath(
    cache_dir: Path,
    out_root: Path,
    local_maps: dict[int, dict[int, int]],
    legion_nodes: dict[int, str],
    legion_adds: dict[int, str],
    aps_by_id: dict[str, int],
    apa_by_id: dict[str, int],
) -> None:
    """Build single ZOR1 LUT for Reclaimed Malevolence (jewel 11)."""
    jewel_type = 11
    compressed = download_jewel_parts(cache_dir, JEWEL_FILES[jewel_type])
    raw = zlib.decompress(compressed)
    if raw[:4] != b"ABYN":
        raise RuntimeError(f"AbyssZorath: bad magic {raw[:4]!r}")

    seed_min, seed_max, seed_inc = struct.unpack_from("<HHH", raw, 6)
    offset = 12
    node_count = struct.unpack_from("<H", raw, offset)[0]
    offset += 2
    node_ids = [
        struct.unpack_from("<H", raw, offset + i * 2)[0] for i in range(node_count)
    ]
    offset += node_count * 2
    seed_count = (seed_max - seed_min) // seed_inc + 1

    index = bytearray()
    mods = bytearray()
    unresolved = 0

    for node_id in node_ids:
        index += struct.pack("<HI", node_id, len(mods))
        for _ in range(seed_count):
            comps_raw, offset = read_mod(raw, offset)
            unresolved += write_resolved_mod(
                mods,
                comps_raw,
                jewel_type,
                local_maps,
                legion_nodes,
                legion_adds,
                aps_by_id,
                apa_by_id,
            )

    if raw[offset : offset + 4] != b"ASCS":
        raise RuntimeError("AbyssZorath: missing ASCS section")
    ascs = raw[offset:]

    # ZOR1 | seeds | nodeCount | ascsOffset | index(nodeId,u32 off)*N | mods | ASCS
    ascs_at = 16 + len(index) + len(mods)
    final = bytearray()
    final += ZORATH_MAGIC
    final += struct.pack("<HHH", seed_min, seed_max, seed_inc)
    final += struct.pack("<H", node_count)
    final += struct.pack("<I", ascs_at)
    final += index
    final += mods
    final += ascs

    out_dir = out_root / str(jewel_type)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "zorath.bin"
    out_path.write_bytes(gzip.compress(bytes(final), compresslevel=9))
    print(
        f"wrote {out_path.relative_to(out_root.parent.parent)} "
        f"gz={out_path.stat().st_size} nodes={node_count} "
        f"unresolved={unresolved}",
        flush=True,
    )


def process_jewel(
    jewel_type: int,
    name: str,
    cache_dir: Path,
    out_root: Path,
    local_maps: dict[int, dict[int, int]],
    legion_nodes: dict[int, str],
    legion_adds: dict[int, str],
    aps_by_id: dict[str, int],
    apa_by_id: dict[str, int],
) -> list[int]:
    compressed = download_jewel_parts(cache_dir, name)
    raw = zlib.decompress(compressed)
    if raw[:4] != b"ABYS":
        raise RuntimeError(f"{name}: bad magic {raw[:4]!r}")

    seed_min, seed_max, seed_inc = struct.unpack_from("<HHH", raw, 6)
    offset = 12
    socket_count = raw[offset]
    abyss_size = raw[offset + 1]
    offset += 2
    sockets = [
        struct.unpack_from("<H", raw, offset + i * 2)[0]
        for i in range(socket_count)
    ]
    offset += socket_count * 2
    seed_count = (seed_max - seed_min) // seed_inc + 1

    out_dir = out_root / str(jewel_type)
    out_dir.mkdir(parents=True, exist_ok=True)
    unresolved = 0

    for socket_id in sockets:
        seed_records: list[list[tuple[int, list[tuple[int, int, list[int]]]]]] = []
        for _ in range(seed_count):
            aff = raw[offset]
            offset += 1
            nodes: list[tuple[int, list[tuple[int, int, list[int]]]]] = []
            for _ in range(aff):
                node_id = struct.unpack_from("<H", raw, offset)[0]
                offset += 2
                comps_raw, offset = read_mod(raw, offset)
                comps: list[tuple[int, int, list[int]]] = []
                for ctype, local_id, rolls in comps_raw:
                    resolved = resolve_component(
                        jewel_type,
                        ctype,
                        local_id,
                        local_maps,
                        legion_nodes,
                        legion_adds,
                        aps_by_id,
                        apa_by_id,
                    )
                    if resolved is None:
                        unresolved += 1
                        continue
                    kind, key = resolved
                    comps.append((kind, key, rolls))
                nodes.append((node_id, comps))
            seed_records.append(nodes)

        blob = build_socket_blob(
            jewel_type,
            seed_min,
            seed_max,
            seed_inc,
            socket_id,
            abyss_size,
            seed_records,
        )
        out_path = out_dir / f"{socket_id}.bin"
        out_path.write_bytes(gzip.compress(blob, compresslevel=9))
        print(
            f"wrote {out_path.relative_to(out_root.parent.parent)} "
            f"gz={out_path.stat().st_size}",
            flush=True,
        )

    if unresolved:
        print(f"WARN jewel {jewel_type}: {unresolved} unresolved components", flush=True)
    return sockets


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=root / ".tmp-pob-abyss")
    parser.add_argument("--out", type=Path, default=root / "public" / "abyss-affected")
    parser.add_argument(
        "--jewels",
        type=int,
        nargs="*",
        default=[7, 8, 9, 10],
        help="Jewel types to build (default 7-10)",
    )
    args = parser.parse_args()

    cache = args.cache
    cache.mkdir(parents=True, exist_ok=True)

    legion_path = cache / "LegionPassives.lua"
    mapping_path = cache / "NodeIndexMapping.lua"
    download(f"{POB_RAW}/LegionPassives.lua", legion_path)
    download(f"{POB_RAW}/NodeIndexMapping.lua", mapping_path)

    legion_nodes, legion_adds = parse_legion_tables(legion_path)
    local_maps = parse_local_id_maps(mapping_path)

    aps = load_json(root / "data" / "alternate_passive_skills.json")
    apa = load_json(root / "data" / "alternate_passive_additions.json")
    aps_by_id = {r["Id"]: int(r["_key"]) for r in aps if r.get("Id") is not None}
    apa_by_id = {r["Id"]: int(r["_key"]) for r in apa if r.get("Id") is not None}
    print(f"aps ids={len(aps_by_id)} apa ids={len(apa_by_id)}", flush=True)

    # Remove legacy flat .bin files from geometry-only build.
    for old in args.out.glob("*.bin"):
        old.unlink()

    all_sockets: set[int] = set()
    has_zorath = False
    for jt in args.jewels:
        name = JEWEL_FILES.get(jt)
        if not name:
            print(f"skip unknown jewel type {jt}", flush=True)
            continue
        if jt == 11:
            process_zorath(
                cache,
                args.out,
                local_maps,
                legion_nodes,
                legion_adds,
                aps_by_id,
                apa_by_id,
            )
            has_zorath = True
            continue
        socks = process_jewel(
            jt,
            name,
            cache,
            args.out,
            local_maps,
            legion_nodes,
            legion_adds,
            aps_by_id,
            apa_by_id,
        )
        all_sockets.update(socks)

    formats = []
    if any(j in (7, 8, 9, 10) for j in args.jewels):
        formats.append("ABY2")
    if has_zorath:
        formats.append("ZOR1")
    manifest = {
        "format": "+".join(formats) or "ABY2",
        "jewels": sorted(args.jewels),
        "sockets": sorted(all_sockets),
        "note": (
            "eyes: abyss-affected/<jewelType>/<socketId>.bin (ABY2 gzip); "
            "Zorath: abyss-affected/11/zorath.bin (ZOR1 gzip)"
        ),
    }
    (args.out / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
