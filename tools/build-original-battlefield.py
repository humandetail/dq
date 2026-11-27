"""Decode the flat 6.25 terrain and pathing for the Web battlefield."""
import base64
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reference/map-6.25"
PATHING = ROOT / "reference/map-6.25-pathing"

terrain = (SOURCE / "war3map.w3e").read_bytes()
assert terrain[:4] == b"W3E!"
offset = 13
for _ in range(2):
    count = struct.unpack_from("<I", terrain, offset)[0]
    offset += 4 + count * 4
columns, rows, x, y = struct.unpack_from("<IIff", terrain, offset)
verts = list(struct.iter_unpack("<HHBBB", terrain[offset + 16:]))
assert len(verts) == columns * rows
assert {v[0] for v in verts} == {8192} and {v[4] & 15 for v in verts} == {2}
grid = (SOURCE / "war3map.wpm").read_bytes()
magic, version, width, height = struct.unpack_from("<4sIII", grid)
assert magic == b"MP3W" and version == 0
assert (width, height) == (4 * (columns - 1), 4 * (rows - 1))
assert len(grid) == 16 + width * height
flags = grid[16:]


def rectangles(mask):
    result = []
    active = {}
    for row in range(height):
        runs = {}
        col = 0
        while col < width:
            if not flags[row * width + col] & mask:
                col += 1
                continue
            start = col
            while col < width and flags[row * width + col] & mask:
                col += 1
            key = (start, col)
            rectangle = active.get(key)
            if rectangle is None:
                rectangle = [int(x) + start * 32, int(y) + row * 32, int(x) + col * 32, 0]
                result.append(rectangle)
            rectangle[3] = int(y) + (row + 1) * 32
            runs[key] = rectangle
        active = runs
    return result


source = json.loads((ROOT / "docs/rules/battlefield-data.json").read_text())
starts = re.findall(r"DefineStartLocation\((\d+), ([\d.-]+), ([\d.-]+)\)", (SOURCE / "war3map.j").read_text())
data = {
    "bounds": [int(x), int(y), int(x) + width * 32, int(y) + height * 32],
    "ground": base64.b64encode(bytes(v[2] & 15 for v in verts)).decode(),
    "groundVariation": base64.b64encode(bytes(v[3] & 31 for v in verts)).decode(),
    "vertices": [columns, rows],
    "spawn": source["spawn_centers"]["0"],
    "worker": [float(v) for v in next(start[1:] for start in starts if start[0] == "0")],
    "circle": source["energy_circle_centers"]["1"],
    "waypoints": [[source["waypoint_regions"][str(i)], source["waypoint_adjacency"][str(i)]]
                  for i in range(len(source["waypoint_regions"]))],
    "pathing": {key: rectangles(mask) for key, mask in [("ground", 2), ("fly", 4), ("build", 8)]},
    "doodads": [{field: item[field] for field in ("id", "position", "angleRadians", "scale")}
                for item in json.loads((PATHING / "doodads-decoded.json").read_text())],
}
output = ROOT / "src/game/m2/original-battlefield.json"
output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"{columns}x{rows} terrain, {width}x{height} pathing, {len(data['waypoints'])} regions")
