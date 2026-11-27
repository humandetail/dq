import { writeFile, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { m3ConfigVersion, m3ContentVersion, m3SaveFormatVersion } from "../src/game/m2/m3-version.ts";
import { mapVersion } from "../src/game/m2/map.ts";

execFileSync(process.execPath, ["tools/check-m3-runtime-coverage.mjs", "--complete"], { stdio: "inherit" });

// Vite's relative base keeps modules, models and textures under the Pages project path.
const html = await readFile("dist/m2.html", "utf8");
if (!html.includes("./assets/")) throw new Error("Pages requires a relative Vite base");
await writeFile("dist/index.html", '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="icon" href="data:,"><meta http-equiv="refresh" content="0;url=./m2.html"><title>TD3 M3 试玩</title><a href="./m2.html">进入 M3 试玩版</a></html>\n');
await writeFile("dist/.nojekyll", "");
const files = [];
for (const file of (await readdir("dist", { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())) {
  if (file.name === "release.json") continue;
  const path = `${file.parentPath}/${file.name}`;
  files.push({ path: path.replace(/^dist\//, ""), sha256: createHash("sha256").update(await readFile(path)).digest("hex") });
}
files.sort((a, b) => a.path.localeCompare(b.path));
const configSha256 = createHash("sha256").update(await readFile("docs/m3-configuration.json")).digest("hex");
await writeFile("dist/release.json", JSON.stringify({ version: process.env.M3_RELEASE_VERSION ?? m3ContentVersion,
  contentVersion: m3ContentVersion, configurationVersion: m3ConfigVersion, configSha256, mapVersion,
  saveFormatVersion: m3SaveFormatVersion,
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  acceptance: "M3 preview", files }, null, 2) + "\n");
