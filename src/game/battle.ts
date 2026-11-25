import { economy, endlessWave, enemies, framesPerSecond, isInsideContainment, items, mainline, map, overcharge } from "./content.ts";
import { executeEconomy, recordResult, shopStock, towerStats, type Outcome } from "./economy.ts";
import type { BattleEvent, Enemy, MatchState, PlayerCommand, ScheduledCommand, Tower } from "./state.ts";

export type Hit = { towerId: number; targetId: number; x: number; y: number };
export type FrameReport = { hits: Hit[]; arrivals: number[]; save: boolean };

export function running(state: MatchState) {
  return state.phase === "mainline" || state.phase === "endless";
}

function waveConfig(state: MatchState, number: number) {
  return state.mode === "endless" ? endlessWave(number) : mainline.waves[number - 1];
}

function scheduleNextWave(state: MatchState) {
  const number = state.lastScheduledWave + 1;
  const wave = waveConfig(state, number);
  if (!wave) return;

  state.lastScheduledWave = number;
  state.waves.push({ number, remainingBatches: wave.batches.length, livingEnemies: 0 });
  wave.batches.forEach((batch, batchIndex) => state.events.push({
    type: "spawn", targetFrame: state.modeStartFrame + wave.startFrame + batch.offsetFrames,
    wave: number, batchIndex, sequence: state.nextEventSequence++,
  }));
}

export function newMatch(matchId: string, seed: number): MatchState {
  const state: MatchState = {
    matchId, frame: 0, modeStartFrame: 0, phase: "mainline", mode: "mainline",
    currentWave: 0, lastCompletedWave: 0, lastScheduledWave: 0, waves: [],
    towers: [], enemies: [], gold: economy.openingGold, stock: shopStock("mainline"),
    cards: [{ id: 1, tower: economy.openingCard }], items: [],
    effects: [], events: [], commands: [], results: [],
    randomState: seed >>> 0, nextInstanceId: 2, nextCommandSequence: 1, nextEventSequence: 1,
  };
  scheduleNextWave(state);
  return state;
}

export function enterEndless(state: MatchState) {
  if (state.phase !== "mainline-won") return false;
  Object.assign(state, { phase: "endless", mode: "endless", modeStartFrame: state.frame,
    currentWave: 0, lastCompletedWave: 0, lastScheduledWave: 0, waves: [], stock: shopStock("endless") });
  state.events = state.events.filter(event => event.type !== "spawn");
  scheduleNextWave(state);
  return true;
}

export function enqueue(state: MatchState, command: PlayerCommand, framesAlreadyDue = 0) {
  if (command.matchId !== state.matchId) return { status: "stale" } as const;
  const previous = state.results.find(result => result.id === command.id);
  if (previous) return { status: "resolved", result: previous } as const;
  const queued = state.commands.find(entry => entry.id === command.id);
  if (queued) return { status: "queued", targetFrame: queued.targetFrame } as const;
  if (!running(state) || command.action.type === "restart" || command.action.type === "enter-endless") {
    return { status: "inactive" } as const;
  }

  const targetFrame = state.frame + framesAlreadyDue + 1;
  state.commands.push({ ...structuredClone(command), sequence: state.nextCommandSequence++, targetFrame });
  return { status: "queued", targetFrame } as const;
}

export function containmentPoints(state: MatchState) {
  return state.enemies.reduce((sum, enemy) =>
    sum + (isInsideContainment(enemy.position) ? enemies[enemy.type].containmentPoints : 0), 0);
}

function overlaps(state: MatchState, enemy: Pick<Enemy, "type" | "id">, position: Enemy["position"], previous?: Enemy["position"]) {
  return state.enemies.some(other => {
    if (other.id === enemy.id) return false;
    const radius = enemies[enemy.type].radius + enemies[other.type].radius;
    const distanceSquared = (point: Enemy["position"]) =>
      (other.position.x - point.x) ** 2 + (other.position.y - point.y) ** 2;
    const distance = distanceSquared(position);
    return distance < radius ** 2 && (!previous || distance <= distanceSquared(previous));
  });
}

function move(state: MatchState, enemy: Enemy) {
  const waypoint = map.route[enemy.nextWaypoint];
  const dx = waypoint.x - enemy.position.x;
  const dy = waypoint.y - enemy.position.y;
  const distance = Math.hypot(dx, dy);
  const step = enemies[enemy.type].speed / framesPerSecond;
  const reached = distance <= step;
  const position = reached ? { ...waypoint } : {
    x: enemy.position.x + dx * step / distance,
    y: enemy.position.y + dy * step / distance,
  };
  if (overlaps(state, enemy, position, enemy.position)) return;
  enemy.position = position;
  if (reached) enemy.nextWaypoint = (enemy.nextWaypoint + 1) % map.route.length;
}

function spawnPosition(state: MatchState, enemy: Pick<Enemy, "type" | "id">) {
  const entry = map.route[0];
  const { maxX, minY } = map.containment;
  const spacing = 0.65;
  // Fill the nearest free row first, within the containment boundary.
  for (let y = entry.y; y >= minY; y -= spacing) {
    for (let x = entry.x; x <= maxX; x += spacing) {
      const position = { x, y };
      if (!overlaps(state, enemy, position)) return position;
    }
  }
  // The official waves fail well before filling the map; keep C01 meaningful for large fixtures.
  return { ...entry };
}

function spawn(state: MatchState, event: Extract<BattleEvent, { type: "spawn" }>, arrivals: number[]) {
  const wave = waveConfig(state, event.wave)!;
  const batch = wave.batches[event.batchIndex];
  const progress = state.waves.find(entry => entry.number === event.wave)!;
  progress.remainingBatches--;
  progress.livingEnemies += batch.count;
  const hp = Math.ceil(enemies[batch.enemy].hp * wave.hpMultiplier);
  for (let count = 0; count < batch.count; count++) {
    const enemy = { id: state.nextInstanceId++, type: batch.enemy };
    state.enemies.push({ ...enemy, wave: event.wave, position: spawnPosition(state, enemy), nextWaypoint: 1, hp });
    arrivals.push(enemy.id);
  }
}

function damage(state: MatchState, target: Enemy, amount: number) {
  target.hp -= amount;
  if (target.hp > 0) return;
  state.gold += enemies[target.type].bountyGold;
  state.waves.find(wave => wave.number === target.wave)!.livingEnemies--;
  state.enemies.splice(state.enemies.indexOf(target), 1);
}

function inRange(tower: Tower, target: Enemy) {
  const { x, y } = map.buildSites[tower.site];
  const { range } = towerStats(tower);
  return (x - target.position.x) ** 2 + (y - target.position.y) ** 2 <= range ** 2;
}

function attack(state: MatchState, tower: Tower | undefined, target: Enemy | undefined, hits: Hit[]): Outcome {
  if (!tower || !target) return { ok: false, reason: "missing" };
  if (tower.attackReadyFrame > state.frame) return { ok: false, reason: "cooldown" };
  if (!inRange(tower, target)) return { ok: false, reason: "range" };
  const stats = towerStats(tower);
  const equipped = state.items.find(item => item.owner.type === "tower" && item.owner.id === tower.id);
  const item = equipped && items[equipped.type];
  const bonus = state.effects.reduce((sum, effect) =>
    sum + (effect.targetId === tower.id && effect.type === "damage-bonus" ? effect.magnitude : 0), 0);
  tower.attackReadyFrame = state.frame + stats.attackIntervalFrames;
  hits.push({ towerId: tower.id, targetId: target.id, ...target.position });
  damage(state, target, Math.max(0, stats.damage + bonus + (item && "bonusDamage" in item ? item.bonusDamage : 0)));
  return { ok: true };
}

function activateOvercharge(state: MatchState, towerId: number): Outcome {
  const tower = state.towers.find(entry => entry.id === towerId);
  if (!tower) return { ok: false, reason: "missing" };
  if ((tower.skillReadyFrames.overcharge ?? 0) > state.frame) return { ok: false, reason: "cooldown" };
  tower.skillReadyFrames.overcharge = state.frame + overcharge.cooldownFrames;
  const effectId = state.nextInstanceId++;
  const expiresFrame = state.frame + overcharge.durationFrames;
  state.effects.push({ id: effectId, type: "damage-bonus", targetId: towerId, expiresFrame, magnitude: overcharge.damageBonus });
  state.events.push({ type: "expire-effect", targetFrame: expiresFrame, sequence: state.nextEventSequence++, effectId });
  return { ok: true };
}

function stop(state: MatchState, dueAttacks: ScheduledCommand[] = []) {
  for (const command of [...dueAttacks, ...state.commands]) {
    recordResult(state, command, { ok: false, reason: "phase" });
  }
  state.commands = [];
  state.events = state.phase === "mainline-won" ? state.events.filter(event => event.type === "expire-effect") : [];
}

export function advanceFrame(state: MatchState): FrameReport {
  const report: FrameReport = { hits: [], arrivals: [], save: false };
  if (!running(state)) return report;
  const frame = ++state.frame;
  const commands = state.commands.filter(command => command.targetFrame === frame)
    .sort((left, right) => left.sequence - right.sequence);
  state.commands = state.commands.filter(command => command.targetFrame !== frame);
  const attacks: ScheduledCommand[] = [];
  for (const command of commands) {
    const { action } = command;
    if (action.type === "attack" || action.type === "overcharge") attacks.push(command);
    else if (action.type === "enter-endless" || action.type === "restart") recordResult(state, command, { ok: false, reason: "phase" });
    else recordResult(state, command, executeEconomy(state, action));
  }
  report.save = commands.length > 0;
  for (const enemy of state.enemies) move(state, enemy);
  const due = state.events.filter(event => event.targetFrame === frame)
    .sort((left, right) => left.sequence - right.sequence);
  state.events = state.events.filter(event => event.targetFrame !== frame);
  let startsWave = false;
  for (const event of due) {
    if (event.type === "expire-effect") state.effects = state.effects.filter(effect => effect.id !== event.effectId);
    if (event.type !== "spawn") continue;
    spawn(state, event, report.arrivals);
    if (event.batchIndex === 0) {
      startsWave = true;
      state.currentWave = event.wave;
    }
  }
  if (startsWave) {
    const points = containmentPoints(state);
    if (points > map.containment.limit) {
      Object.assign(state, { phase: "failed", containmentPoints: points });
      stop(state, attacks);
      return { ...report, save: true };
    }
    scheduleNextWave(state);
  }

  for (const command of attacks) {
    const { action } = command;
    if (action.type === "overcharge") {
      recordResult(state, command, activateOvercharge(state, action.towerId));
      continue;
    }
    if (action.type !== "attack") continue;
    const tower = state.towers.find(tower => tower.id === action.towerId);
    const target = state.enemies.find(enemy => enemy.id === action.targetId);
    recordResult(state, command, attack(state, tower, target, report.hits));
  }
  for (const event of due) {
    if (event.type !== "damage") continue;
    const target = state.enemies.find(enemy => enemy.id === event.targetId);
    if (target) damage(state, target, event.amount);
  }
  for (const tower of state.towers) {
    if (tower.attackReadyFrame <= frame) {
      const target = state.enemies.find(enemy => inRange(tower, enemy));
      if (target) attack(state, tower, target, report.hits);
    }
  }

  while (state.waves[0]?.remainingBatches === 0 && state.waves[0].livingEnemies === 0) {
    state.lastCompletedWave = state.waves.shift()!.number;
  }
  if (state.mode === "mainline" && state.lastCompletedWave === mainline.waves.length) {
    Object.assign(state, { phase: "mainline-won" });
    stop(state);
    report.save = true;
  }
  return report;
}
