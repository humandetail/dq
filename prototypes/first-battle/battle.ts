export const frameMs = 250;
export const tower = { id: 'tower', x: 0, range: 2, radius: 0.6 };
export const enemy = { radius: 0.4, speed: 1, hp: 2 };
export const capacity = 1;
const capacityCircle = { x: 3, radius: 3 };

type Unit = { id: string; x: number; hp: number; blocked: boolean; points: number };
type Command = { frame: number; target: string } | EconomyCommand;
type Event = { frame: number; type: 'spawn'; startsWave?: boolean; points?: number; hp?: number; x?: number };
export type Battle = {
  frame: number;
  rng: number;
  nextEnemyId: number;
  units: Unit[];
  commands: Command[];
  pending: Event[];
  result: 'running' | 'win' | 'loss';
  log: string[];
  session?: { id: string; phase: 'main' | 'between' | 'endless' | 'ended'; wave: number; lastWave: number };
  economy?: Economy;
  attackReadyAt?: number;
};

export function newBattle(firstAttack = true): Battle {
  return {
    frame: 0, rng: 42, nextEnemyId: 1,
    units: [{ id: 'old', x: 1, hp: enemy.hp, blocked: false, points: 1 }],
    commands: [...(firstAttack ? [{ frame: 1, target: 'old' }] : []), { frame: 8, target: 'new' }],
    pending: [{ frame: 2, type: 'spawn', startsWave: true }],
    result: 'running', log: [],
  };
}

export function newSession(id: string): Battle {
  return {
    ...newBattle(), session: { id, phase: 'main', wave: 1, lastWave: 0 }, attackReadyAt: 0,
    economy: { coins: 3, stock: 1, items: [{ id: 'starter', kind: 'ore' }], outcomes: {} },
  };
}

function scheduleEndless(state: Battle, wave: number) {
  // Compact review fixture. A wave stays finite; the scheduler has no final wave.
  state.pending.push({ frame: state.frame + 1, type: 'spawn', startsWave: true, x: 1, hp: wave, points: 1 });
  if (wave % 6 === 0) state.pending.push({ frame: state.frame + 1, type: 'spawn', x: 1, hp: wave, points: 1 });
}

export function enterEndless(state: Battle) {
  if (state.session?.phase !== 'between') return false;
  state.session.phase = 'endless';
  state.session.wave = 1;
  state.session.lastWave = 0;
  state.result = 'running';
  state.commands = [];
  state.pending = [];
  if (state.economy) state.economy.stock = 2;
  scheduleEndless(state, 1);
  return true;
}

export function enqueueEconomy(state: Battle, command: EconomyCommand) {
  if (state.result === 'running' && state.economy && command.frame > state.frame) state.commands.push(command);
}

export function capacityPoints(units: Unit[]) {
  return units.reduce((sum, unit) => sum + (Math.abs(unit.x - capacityCircle.x) <= capacityCircle.radius ? unit.points : 0), 0);
}

export function advanceFrame(state: Battle) {
  if (state.result !== 'running') return false;
  const frame = ++state.frame;
  let attacked = false;
  const record = (message: string) => state.log.push(`${frame} ${message}`);
  const commands = state.commands.filter(command => command.frame === frame);
  state.commands = state.commands.filter(command => command.frame !== frame);
  for (const command of commands) {
    if (!('kind' in command) || !state.economy) continue;
    const previous = state.economy;
    state.economy = executeEconomy(previous, command);
    if (state.economy !== previous) record(`${command.kind} ${command.id} ${state.economy.outcomes[command.id]}`);
  }
  const clearance = tower.radius + enemy.radius;
  for (const unit of state.units) {
    const next = unit.x - enemy.speed;
    unit.blocked = next < clearance;
    unit.x = Math.max(next, clearance);
  }

  const events = state.pending.filter(event => event.frame === frame);
  state.pending = state.pending.filter(event => event.frame !== frame);
  for (const event of events) {
    const identity = state.nextEnemyId++;
    state.units.push({
      id: identity === 1 ? 'new' : `new-${identity}`,
      x: event.x ?? 6, hp: event.hp ?? enemy.hp, blocked: false,
      points: event.points ?? 1,
    });
    record(`出怪，容怪点数 ${capacityPoints(state.units)}/${capacity}`);
  }
  if (events.some(event => event.startsWave)) {
    const points = capacityPoints(state.units);
    record(`容怪检查 ${points}/${capacity}`);
    if (points > capacity) {
      state.result = 'loss';
      if (state.session) state.session.phase = 'ended';
      state.pending = [];
      state.commands = [];
      record('失败');
      return false;
    }
  }
  for (const command of commands) {
    if (!('target' in command)) continue;
    const target = state.units.find(unit => unit.id === command.target);
    if (!target || Math.abs(target.x - tower.x) > tower.range) {
      record(`攻击拒绝 ${command.target}，目标缺失或超出射程`);
      continue;
    }
    state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
    const damage = 2 + (state.rng >>> 31);
    target.hp -= damage;
    attacked = true;
    record(`攻击 ${target.id}，伤害 ${damage}${target.blocked ? '，移动受碰撞限制' : ''}`);
    if (target.hp <= 0) {
      state.units = state.units.filter(unit => unit.id !== target.id);
      record(`击杀 ${target.id}`);
    }
    if (state.session) state.attackReadyAt = frame + 2;
  }
  if (state.session?.phase === 'endless' && frame >= (state.attackReadyAt ?? 0)) {
    const target = state.units.find(unit => Math.abs(unit.x - tower.x) <= tower.range);
    if (target) {
      state.attackReadyAt = frame + 2;
      target.hp -= 5;
      attacked = true;
      record(`自动攻击 ${target.id}`);
      if (target.hp <= 0) {
        state.units = state.units.filter(unit => unit.id !== target.id);
        record(`击杀 ${target.id}`);
      }
    }
  }

  if (!state.units.length && !state.pending.length) {
    if (state.session?.phase === 'endless') {
      const wave = state.session.wave;
      state.session.lastWave = wave;
      state.session.wave++;
      record(`完成无尽第 ${wave} 波`);
      scheduleEndless(state, state.session.wave);
    } else {
      if (state.session) state.session.phase = 'between';
      state.result = 'win';
      record('胜利');
    }
  }
  return attacked;
}

export function enqueueAttack(state: Battle, target: string) {
  if (state.result === 'running') state.commands.push({ frame: state.frame + 1, target });
}

export type Snapshot = { battle: Battle; remainderMs: number; speed?: number; paused?: boolean };

export function advanceTime(snapshot: Snapshot, elapsedMs: number, speed: number) {
  const total = snapshot.remainderMs + elapsedMs * speed;
  const frames = Math.floor(total / frameMs);
  snapshot.remainderMs = total % frameMs;
  let attacked = false;
  for (let frame = 0; frame < frames && snapshot.battle.result === 'running'; frame++) {
    if (advanceFrame(snapshot.battle)) attacked = true;
  }
  if (snapshot.battle.result !== 'running') snapshot.remainderMs = 0;
  return attacked;
}
import { executeEconomy, type Economy, type EconomyCommand } from './economy.ts';

