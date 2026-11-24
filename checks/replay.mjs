import { readFile } from "node:fs/promises";
import { advanceFrame, enqueue, enterEndless, newMatch, running } from "../src/game/battle.ts";

const path = process.argv[2];
if (!path) throw new Error("用法：node checks/replay.mjs <轨迹.json>");
const { seed, finalFrame, commands = [] } = JSON.parse(await readFile(path, "utf8"));
if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(finalFrame) || finalFrame < 0 || !Array.isArray(commands)) {
  throw new Error("轨迹须包含整数 seed 和非负整数 finalFrame");
}

const state = newMatch("replay", seed);
let cursor = 0;
while (state.frame <= finalFrame) {
  const entry = commands[cursor];
  if (entry && (!Number.isSafeInteger(entry.afterFrame) || entry.afterFrame < state.frame)) {
    throw new Error("命令须按 afterFrame 从小到大排列");
  }
  if (entry?.afterFrame === state.frame) {
    cursor++;
    if (entry.action.type === "enter-endless") {
      if (!enterEndless(state)) throw new Error(`第 ${state.frame} 帧无法进入无尽`);
    } else {
      const result = enqueue(state, {
        matchId: state.matchId,
        id: entry.id ?? String(cursor),
        action: entry.action,
      });
      if (result.status === "inactive") throw new Error(`第 ${state.frame} 帧无法提交命令`);
    }
    continue;
  }
  if (!running(state) || state.frame === finalFrame) break;
  advanceFrame(state);
}
if (cursor < commands.length) throw new Error("对局在剩余命令到期前停止");

process.stdout.write(JSON.stringify(state, null, 2) + "\n");
