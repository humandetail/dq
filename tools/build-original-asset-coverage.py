"""Compare the 6.25 extraction catalogue with the game assets and bindings."""
import csv
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
report = json.loads((root / "docs/m3-original-assets-bindings.json").read_text())
icon_index = json.loads((root / "src/assets/original-icons/index.json").read_text())
icon_names = {Path(name).stem.casefold() for entry in icon_index.values() for name in entry.values()}
uses = {name.casefold(): sites for name, sites in report["files"].items()}
hashes = defaultdict(list)
for path in (root / "src/assets").rglob("*"):
    if path.is_file() and path.suffix.lower() in {".blp", ".mdx", ".mp3", ".wav", ".tga"}:
        hashes[hashlib.sha256(path.read_bytes()).hexdigest()].append(str(path.relative_to(root)))

model_statuses = defaultdict(set)
for binding in report["bindings"]:
    if binding["status"] != "原包未找到该路径":
        model_statuses[binding["original"].casefold()].add(binding["status"])

runtime_references = {
    "war3map.w3e": ("数据来源", "地表和地表变体"),
    "war3map.wpm": ("数据来源", "静态寻路和建造网格"),
    "war3map.doo": ("数据来源", "装饰位置、角度和缩放"),
    "war3map.w3d": ("数据来源", "装饰对象和素材映射"),
    "war3map.j": ("数据来源", "初始坐标和界面证据"),
    "war3mapmap.blp": ("已接入", "src/assets/original-icons/war3mapMap.png"),
    "war3mappreview.tga": ("已接入", "src/assets/original-icons/war3mapPreview.png"),
    "war3mapimported/hjtx huaban02.mdx": ("原模型缺依赖", "D006 用包内 shuye.blp 近似"),
    "war3mapimported/guangyun1.mdx": ("原模型缺依赖", "D007 缺 GenericGlowX.blp，用包内 GenericGlow64.blp 近似"),
    "bg_2.mp3": ("未建立现有入口", "深渊模式音乐"),
    "bg_3.mp3": ("未建立现有入口", "深渊模式音乐"),
    "song_of_the_siren.wav": ("未建立现有入口", "深渊 N538 海妖之歌"),
    "bizmmixdowns.wav": ("未建立现有入口", "原图赛季奖励展示单位"),
    "111.wav": ("未建立现有入口", "原图赛季奖励展示单位"),
}


def status(row):
    name = row["原路径"].replace("\\", "/").casefold()
    if name in uses:
        return "已接入", " | ".join(uses[name])
    if row["SHA-256"] in hashes:
        return "已接入", " | ".join(sorted(hashes[row["SHA-256"]]))
    if name in runtime_references:
        return runtime_references[name]
    if name in model_statuses:
        return " | ".join(sorted(model_statuses[name])), "见对象绑定清单"
    if Path(name).suffix == ".blp" and Path(name).stem in icon_names:
        return "已有同名图标", "src/assets/original-icons/"
    if row["类别"] == "空档案项":
        return "空档案项", ""
    if not name:
        return "待识别", row["导出路径"]
    return "未建立现有入口", ""


with (source / "素材清单.csv").open(encoding="utf-8-sig", newline="") as raw, \
        (root / "docs/m3-original-assets-coverage.csv").open("w", encoding="utf-8-sig", newline="") as output:
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["档案编号", "类别", "核实原路径", "SHA-256", "接入状态", "接入位置或说明"])
    for row in csv.DictReader(raw):
        writer.writerow([row["档案编号"], row["类别"], row["原路径"], row["SHA-256"], *status(row)])
