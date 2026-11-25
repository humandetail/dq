import source from "../../../docs/rules/session-and-task-state.json" with { type: "json" };
import { configuration } from "./content.ts";

export type Season = keyof typeof source.seasonalTasks;
export type SeasonProgress = { counts: Partial<Record<number, number>>; points: number; nodes: number[]; unlocks: string[] };
export type Seasons = Record<Season, SeasonProgress>;

export const seasonNames = ["spring", "summer"] as const;
export const seasonDefinitions = source.seasonalTasks;

export function emptySeasons(): Seasons {
  return {
    spring: { counts: {}, points: 0, nodes: [], unlocks: [] },
    summer: { counts: {}, points: 0, nodes: [], unlocks: [] },
  };
}

export function creditSeason(seasons: Seasons, season: Season, id: number, amount: number) {
  if (configuration.deferredSeasonTasks[season].includes(id) || amount <= 0) return 0;
  const definitions = seasonDefinitions[season];
  const task = definitions.tasks[String(id) as keyof typeof definitions.tasks];
  if (!task) return 0;
  const progress = seasons[season];
  const previous = progress.counts[id] ?? 0;
  if (previous >= task["4"]) return 0;
  progress.counts[id] = Math.min(task["4"], task["6"] === 1 ? amount : previous + amount);
  if (progress.counts[id] < task["4"]) return 0;
  const oldPoints = progress.points;
  progress.points += task["5"];
  let score = 0;
  for (let node = Math.floor(oldPoints / 10) + 1; node <= Math.floor(progress.points / 10); node++) {
    if (progress.nodes.includes(node)) continue;
    const rewards = definitions.rewards;
    const reward = rewards[String(node) as keyof typeof rewards];
    if (!reward || reward["1"] === 0) continue;
    progress.nodes.push(node);
    if (reward["1"] === 1 && "3" in reward && typeof reward["3"] === "number") score += reward["3"];
    if (reward["1"] === 2 && "3" in reward && typeof reward["3"] === "string") progress.unlocks.push(reward["3"]);
  }
  return score;
}

export function startSeasons() {
  const seasons = emptySeasons();
  const score = creditSeason(seasons, "spring", 7, 666) + creditSeason(seasons, "summer", 7, 666);
  return { seasons, score };
}
