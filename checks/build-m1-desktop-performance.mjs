// Builds the real game UI with measurement hooks in a disposable source directory.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const output = resolve(process.argv[2] ?? "/tmp/td3-m1-desktop-performance");
const project = new URL("../", import.meta.url);
const scratch = mkdtempSync(join(tmpdir(), "td3-perf-build-"));
try {
  for (const path of ["src", "index.html", "package.json", "tsconfig.json"]) cpSync(new URL(path, project), join(scratch, path), { recursive: true });
  const entry = join(scratch, "src/main.ts");
  let source = readFileSync(entry, "utf8");
  function patch(oldText, newText) {
    if (!source.includes(oldText)) throw new Error("Missing source anchor: " + oldText);
    source = source.replace(oldText, newText);
  }
  patch("function save(now: number)", "const desktopAudit = (globalThis as any).desktopAudit;\n\nfunction save(now: number)");
  patch("  lastSave = now;\n  const revision", "  lastSave = now;\n  if (desktopAudit && !desktopAudit.saving) return;\n  const revision");
  patch('  void store.save(snapshot).then(result => {', '  const captureStart = performance.now();\n  const write = store.save(snapshot);\n  desktopAudit?.capture(performance.now() - captureStart);\n  void write.then(result => {\n    if (result === "saved") desktopAudit?.committed(performance.now() - captureStart);');
  patch('    feedback.textContent = `已接收：${actionNames[action.type]}`;', '    feedback.textContent = `已接收：${actionNames[action.type]}`;\n    desktopAudit?.queued({ id, targetFrame: command.targetFrame });');
  patch("  drainFrames(snapshot, 240, report => {", "  const pendingBeforeDrain = snapshot.clock.pendingFrames;\n  let frameStart = performance.now();\n  drainFrames(snapshot, 240, report => {\n    desktopAudit?.frame(performance.now() - frameStart);\n    frameStart = performance.now();");
  patch("    sentActions.delete(result.id);", "    desktopAudit?.settled(result, snapshot.state.frame);\n    sentActions.delete(result.id);");
  patch("    scene?.draw(now);", "    const drawStart = performance.now();\n    scene?.draw(now);\n    desktopAudit?.draw(performance.now() - drawStart);");
  patch(" >= 5000)) save(now);", " >= 5000)) save(now);\n  if (draw) desktopAudit?.update(snapshot, pendingBeforeDrain);");
  writeFileSync(entry, source);
  const nodeModules = new URL("node_modules/", project);
  const { symlinkSync } = await import("node:fs");
  symlinkSync(nodeModules, join(scratch, "node_modules"), "dir");
  const vite = new URL("vite/bin/vite.js", nodeModules);
  const build = spawnSync(process.execPath, [vite.pathname, "build", "--outDir", output, "--emptyOutDir"], { cwd: scratch, stdio: "inherit" });
  if (build.status !== 0) throw new Error("Instrumented build failed");
  writeFileSync(join(output,"fixture.html"), "<!doctype html><title>TD3 audit fixture</title>");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
