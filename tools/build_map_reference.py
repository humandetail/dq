"""Rebuild static map tables and battlefield evidence; does not run game code."""

import ast
import collections
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reference/map-6.25"
OUTPUT = ROOT / "docs/rules"


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def parse_slk(path):
    rows = {}
    x = y = 0
    for line in path.read_text().splitlines():
        if not line.startswith("C;"):
            continue
        value = None
        for field in re.findall(r'(?:[^;"\n]|"(?:[^"]|"")*")+', line)[1:]:
            if field.startswith("X"):
                x = int(field[1:])
            elif field.startswith("Y"):
                y = int(field[1:])
            elif field.startswith("K"):
                value = field[1:]
                if value.startswith('"'):
                    value = value[1:-1].replace('""', '"')
                else:
                    try:
                        value = int(value)
                    except ValueError:
                        value = float(value)
        if value is not None:
            rows.setdefault(y, {})[x] = value
    headers = rows.pop(1)
    return [{headers[k]: v for k, v in row.items()} for row in rows.values()]


def decode_initializers(disassembly):
    """Interpret only two verified straight-line data initializers, fail otherwise."""
    globals_ = {
        "Rect": lambda *args: list(args),
        "GetRectCenter": lambda rect: [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2],
        "Get_region_by_rect": lambda rect: {"rect": rect},
    }
    for name in ("pos_arr_monster_start", "pos_arr_monster_path", "pos_arr_monster_path_region", "point_runes", "point_player_box", "path_map"):
        globals_[name] = {}
    for function in ("main/f306/f1", "main/f306/f4"):
        match = re.search(r"^\.function\s+" + re.escape(function) + r"\n(.*?)(?=^\.function|\Z)", disassembly, re.M | re.S)
        assert match, function
        constants = {}
        registers = {}
        for raw in match.group(1).splitlines():
            if raw.startswith(".constant"):
                _, key, value = raw.split(maxsplit=2)
                constants[key] = None if value == "nil" else ast.literal_eval(value)
        def value(operand):
            return constants[operand] if operand.startswith("k") else registers[operand]
        for raw in match.group(1).splitlines():
            line = raw.split(";", 1)[0].strip()
            if not line or line.startswith("."):
                continue
            op, *args = line.split()
            if op == "gettabup":
                registers[args[0]] = globals_[value(args[2])]
            elif op == "settabup":
                globals_[value(args[1])] = value(args[2])
            elif op == "loadk":
                registers[args[0]] = value(args[1])
            elif op == "loadnil":
                start = int(args[0][1:])
                for i in range(int(args[1]) + 1):
                    registers[f"r{start + i}"] = None
            elif op == "newtable":
                registers[args[0]] = {}
            elif op == "settable":
                value(args[0])[value(args[1])] = value(args[2])
            elif op == "setlist":
                register, count, block = args
                assert int(count) > 0 and int(block) > 0, line
                start = int(register[1:])
                for i in range(1, int(count) + 1):
                    registers[register][(int(block) - 1) * 50 + i] = registers[f"r{start + i}"]
            elif op == "call":
                register, count, returns = args
                assert returns == "2" and int(count) > 0, line
                start = int(register[1:])
                registers[register] = registers[register](*(registers[f"r{i}"] for i in range(start + 1, start + int(count))))
            elif op == "return":
                break
            else:
                raise ValueError(f"Unexpected initializer instruction: {line}")
    return globals_


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    table_counts = {}
    for path in sorted(SOURCE.glob("*.slk")):
        data = parse_slk(path)
        decoded_path = path.with_suffix(".json")
        if decoded_path.exists():
            assert json.loads(decoded_path.read_text()) == data, f"Existing evidence differs: {decoded_path}"
        else:
            write_json(decoded_path, data)
        table_counts[path.stem] = len(data)

    decoded = decode_initializers((SOURCE / "main.disasm").read_text())
    regions = {k: v for k, v in decoded.items() if k.startswith("gg_rct_")}
    assert len(regions) == 32
    # Independent comparison with decompiled straight-line rectangle assignments.
    lua = (SOURCE / "main.readable.lua").read_text()
    pattern = r"L1_3 = Rect\s+L2_3 = ([-\d.]+)\s+L3_3 = ([-\d.]+)\s+L4_3 = ([-\d.]+)\s+L5_3 = ([-\d.]+)\s+L1_3 = L1_3\(L2_3, L3_3, L4_3, L5_3\)\s+(gg_rct_\w+) = L1_3"
    lua_rects = {m[4]: list(map(float, m[:4])) for m in re.findall(pattern, lua)}
    assert lua_rects == regions, "Lua and bytecode rectangle data differ"
    edges = {str(k): list(v.values()) for k, v in decoded["path_map"].items()}
    assert len(edges) == 24 and all(0 <= n < 24 for nodes in edges.values() for n in nodes)

    terrain = (SOURCE / "war3map.w3e").read_bytes()
    assert terrain[:4] == b"W3E!"
    offset = 13
    tiles = {}
    for kind in ("ground", "cliff"):
        count = struct.unpack_from("<I", terrain, offset)[0]
        offset += 4
        tiles[kind] = [terrain[offset + 4*i:offset + 4*i + 4].decode("ascii") for i in range(count)]
        offset += 4 * count
    width, height, origin_x, origin_y = struct.unpack_from("<IIff", terrain, offset)
    offset += 16
    assert len(terrain) == offset + width * height * 7
    pathing = (SOURCE / "war3map.wpm").read_bytes()
    magic, version, grid_w, grid_h = struct.unpack_from("<4sIII", pathing)
    assert magic == b"MP3W" and len(pathing) == 16 + grid_w * grid_h
    assert grid_w == (width - 1) * 4 and grid_h == (height - 1) * 4
    data = {
        "evidence": {"rectangles": "main.disasm main/f306/f1", "adjacency": "main.disasm main/f306/f4", "routing": "main.disasm main/f306/f33 (manually reviewed)"},
        "terrain": {"version": struct.unpack_from("<I", terrain, 4)[0], "vertices": [width, height], "origin": [origin_x, origin_y], "tiles": tiles},
        "pathing": {"version": version, "dimensions": [grid_w, grid_h], "cell_world_units": 32, "source": "../../reference/map-6.25/war3map.wpm", "byte_histogram": dict(sorted(collections.Counter(pathing[16:]).items())), "unwalkable_cells": sum(bool(x & 2) for x in pathing[16:]), "unbuildable_cells": sum(bool(x & 8) for x in pathing[16:])},
        "regions": regions,
        "spawn_centers": decoded["pos_arr_monster_start"],
        "waypoint_regions": decoded["pos_arr_monster_path"],
        "waypoint_adjacency": edges,
        "energy_circle_centers": decoded["point_player_box"],
    }
    write_json(OUTPUT / "battlefield-data.json", data)
    print(json.dumps({"tables": table_counts, "regions": len(regions), "waypoints": len(edges), "pathing": [grid_w, grid_h]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
