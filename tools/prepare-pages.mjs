import { writeFile, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { configuration, contentVersion, saveFormatVersion } from "../src/game/m2/content.ts";
import { mapVersion } from "../src/game/m2/map.ts";

// Vite's relative base keeps modules, models and textures under the Pages project path.
const html = await readFile("dist/m2.html", "utf8");
if (!html.includes("./assets/")) throw new Error("Pages requires a relative Vite base");
await writeFile("dist/index.html", '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./m2.html"><title>TD3 M2 试玩</title><a href="./m2.html">进入 M2 试玩版</a></html>\n');
await writeFile("dist/.nojekyll", "");
const files = [];
for (const file of (await readdir("dist", { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())) {
  if (file.name === "release.json") continue;
  const path = `${file.parentPath}/${file.name}`;
  files.push({ path: path.replace(/^dist\//, ""), sha256: createHash("sha256").update(await readFile(path)).digest("hex") });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const configSha256 = createHash("sha256").update(await readFile("docs/m2-configuration.json")).digest("hex");
await writeFile("dist/release.json", JSON.stringify({ version: process.env.M2_RELEASE_VERSION ?? contentVersion,
  contentVersion, configurationVersion: configuration.version, configSha256, mapVersion, saveFormatVersion,
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  acceptance: "Preview; M2 acceptance remains incomplete. Performance temporarily accepted by user.", files }, null, 2) + "\n");
