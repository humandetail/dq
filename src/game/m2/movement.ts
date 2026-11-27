import { chooseWaypoint, contains, map, overlaps, segmentEntry, waypointRegions, type Disk, type MovementLayer, type Point, type Rect } from "./map.ts";
import { findPath, findPathSteps, segmentDistanceSquared, staticSweep } from "./pathfinding.ts";

export type Mobile = Disk & {
  id: number;
  layer: MovementLayer;
  speed: number;
  speedBuff?: number;
  windwalkSpeed?: number;
  auraSpeed?: number;
  purge?: { middleUs: number; endUs: number; factor: number };
  oraclePauseUntilUs?: number;
  searingChainsUntilUs?: number;
  pitNetUntilUs?: number;
  boarVenom?: Record<number, { untilUs: number; rate: number }>;
  clapSlow?: { untilUs: number; factor: number; attackPenalty?: number };
  nativeSlow?: { untilUs: number; factor: number; attackPenalty: number };
  bristleGooSlow?: { factor: number; untilUs: number };
  calldownSlow?: { untilUs: number; factor: number };
  stunUntilUs?: number;
  wraithMarkUntilUs?: number;
  iceBindingUntilUs?: number;
  bearRootUntilUs?: number;
  bearRoarUntilUs?: number;
  doomRoarUntilUs?: number;
  duelLockUntilUs?: number;
  doomFrostUntilUs?: number;
  voidSlowUntilUs?: number;
  lichChainSlow?: { factor: number; attackPenalty: number; untilUs: number };
  torrentLift?: { token: number; height: number };
  ravageLift?: { token: number; height: number };
  impaleLift?: { token: number; height: number };
  tideCorrosion?: { armor: number; untilUs: number };
  stoneGaze?: { timers: Record<number, number>; paused: boolean; frozenFrameUs?: number; crystalline?: boolean };
  doomWave?: { amount: number; untilUs: number };
  freezingFieldSlow?: boolean;
  shadowWindSlow?: true;
  decrepifyUntilUs?: number;
  phantomSlow?: { untilUs: number; attackPenalty: number };
  upheavalSlow?: number;
  doomUntilUs?: number;
  hexUntilUs?: number;
  leashes?: number[];
  frost?: { factor: number; expiresUs: number };
  coldArrow?: { factor: number; expiresUs: number };
  dragonFrost?: { factor: number; attackPenalty: number; expiresUs: number };
  lifeBreakSlowUs?: number;
  previousWaypoint: number | null;
  waypoint: number;
  initialOverlaps: number[];
  insideRegions?: number[];
  path?: Point[];
};

export const movementStepUs = 31_250;

export type RouteSpan = {
  from: Point;
  to: Point;
  fromUs: number;
  untilUs: number;
  rate: number;
  phased?: true;
  endsAt?: number | "corner";
  timerId?: number;
};

type Obstacle = Pick<Mobile, "id" | "layer" | "x" | "y" | "radius">;
type Obstacles = readonly Obstacle[] |
  ((layer: MovementLayer, minX: number, minY: number, maxX: number, maxY: number) => Iterable<Obstacle>);

export function movementSweep(unit: Mobile, obstacles: Obstacles, blocked: readonly Rect[] = [], firstOverlaps = unit.initialOverlaps) {
  return (from: Point, to: Point) => {
    if (!staticSweep(from, to, unit.radius, unit.layer, blocked)) return false;
    const dx = to.x - from.x, dy = to.y - from.y;
    const minX = Math.min(from.x, to.x), maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y), maxY = Math.max(from.y, to.y);
    const padding = unit.radius;
    const candidates = typeof obstacles === "function"
      ? obstacles(unit.layer, minX - padding, minY - padding, maxX + padding, maxY + padding)
      : obstacles;
    for (const other of candidates) {
      if (other.id === unit.id || other.layer !== unit.layer) continue;
      const radius = unit.radius + other.radius;
      if (other.x + radius <= minX || other.x - radius >= maxX ||
          other.y + radius <= minY || other.y - radius >= maxY) continue;
      const sx = from.x - other.x, sy = from.y - other.y;
      if (sx * sx + sy * sy < radius ** 2 && firstOverlaps.includes(other.id) &&
          sx * dx + sy * dy >= 0 && (dx !== 0 || dy !== 0)) continue;
      if (segmentDistanceSquared(from, to, other) < radius ** 2) return false;
    }
    return true;
  };
}

export function effectiveMoveSpeed(unit: Mobile) {
  const venom = unit.boarVenom ? Object.values(unit.boarVenom).reduce((minimum, mark) => Math.min(minimum, mark.rate), 1) : 1;
  const speed = unit.speed * Math.min(unit.frost?.factor ?? 1, unit.coldArrow?.factor ?? 1, unit.dragonFrost?.factor ?? 1) * (unit.speedBuff ?? 1) *
    (unit.auraSpeed ?? 1) * (unit.freezingFieldSlow ? .6 : 1) * (unit.shadowWindSlow ? .7 : 1) * (unit.decrepifyUntilUs === undefined ? 1 : .5) * (unit.clapSlow?.factor ?? 1) * (unit.nativeSlow?.factor ?? 1) * (unit.calldownSlow?.factor ?? 1) *
    (unit.doomWave ? .6 : 1) * (unit.phantomSlow ? .6 : 1) * (unit.lichChainSlow?.factor ?? 1) * (unit.doomFrostUntilUs ? .8 : 1) *
    (unit.lifeBreakSlowUs ? .5 : 1) * (unit.voidSlowUntilUs ? .5 : 1) * (unit.tideCorrosion ? .6 : 1) *
    (unit.upheavalSlow ?? 1) * (unit.windwalkSpeed ?? 1) * (unit.bristleGooSlow?.factor ?? 1) * venom;
  return unit.hexUntilUs && unit.speed > 0 ? 100 : unit.purge && speed > 0 ? Math.max(50, speed * unit.purge.factor) : speed;
}

export function movementRate(unit: Mobile) {
  return unit.torrentLift || unit.ravageLift || unit.impaleLift || unit.stoneGaze?.paused || unit.stunUntilUs || unit.wraithMarkUntilUs || unit.iceBindingUntilUs || unit.bearRootUntilUs ||
    unit.bearRoarUntilUs || unit.doomRoarUntilUs || unit.duelLockUntilUs || unit.doomUntilUs || unit.oraclePauseUntilUs || unit.searingChainsUntilUs ||
    unit.pitNetUntilUs || unit.leashes?.length ? 0 : effectiveMoveSpeed(unit);
}

export function routeSpanPoint(span: RouteSpan, atUs: number): Point {
  if (atUs >= span.untilUs) return span.to;
  if (atUs <= span.fromUs) return span.from;
  const fraction = (atUs - span.fromUs) / (span.untilUs - span.fromUs);
  return { x: span.from.x + (span.to.x - span.from.x) * fraction, y: span.from.y + (span.to.y - span.from.y) * fraction };
}

export type RoutePlan = {
  span: RouteSpan;
  regions?: number[];
  path?: { points: Point[] | undefined };
};

export function* planRouteSpan(unit: Mobile, others: Obstacles, blocked: readonly Rect[],
                              firstOverlaps: number[], now: number, anchor: number): Generator<void, RoutePlan> {
  const rate = movementRate(unit);
  const from = { x: unit.x, y: unit.y };
  const idle: RouteSpan = { from, to: from, fromUs: now, untilUs: anchor, rate };
  if (rate <= 0 || anchor <= now) return { span: idle };
  const sweep = movementSweep(unit, others, blocked, firstOverlaps);
  const regions = unit.insideRegions ?? waypointRegions.flatMap((region, id) => contains(region, unit) ? [id] : []);
  let path = unit.path;
  let changed = false;
  const checkedWaypoint = path?.[0];
  const checkedClear = checkedWaypoint !== undefined && sweep(unit, checkedWaypoint);
  if (!checkedClear) {
    path = (yield* findPathSteps(unit, map.waypoints[unit.waypoint], sweep))?.points;
    changed = true;
  }
  let start = 0;
  while (path?.[start] && Math.hypot(path[start].x - unit.x, path[start].y - unit.y) <= 1e-8) start++;
  if (start > 0) {
    path = path!.slice(start);
    changed = true;
  }
  const plan: RoutePlan = { span: idle };
  if (unit.insideRegions === undefined) plan.regions = regions;
  if (changed) plan.path = { points: path };
  const next = path?.[0];
  if (!next) return plan;
  if ((!checkedClear || next !== checkedWaypoint) && !sweep(unit, next)) return plan;
  const distance = Math.hypot(next.x - unit.x, next.y - unit.y);
  const step = Math.min(distance, rate * (anchor - now) / 1_000_000);
  const to = { x: unit.x + (next.x - unit.x) * step / distance, y: unit.y + (next.y - unit.y) * step / distance };
  const minX = Math.min(from.x, to.x), maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y), maxY = Math.max(from.y, to.y);
  let entry: { t: number; id: number } | undefined;
  for (let id = 0; id < waypointRegions.length; id++) {
    const region = waypointRegions[id];
    if (maxX < region.minX || minX > region.maxX || maxY < region.minY || minY > region.maxY || regions.includes(id)) continue;
    const t = segmentEntry(unit, to, region);
    if (t !== undefined && (entry === undefined || t < entry.t)) entry = { t, id };
  }
  if (entry) {
    const endpoint = { x: from.x + (to.x - from.x) * entry.t, y: from.y + (to.y - from.y) * entry.t };
    plan.span = { from, to: endpoint, fromUs: now,
      untilUs: Math.min(anchor, now + Math.round(step * entry.t / rate * 1_000_000)), rate, endsAt: entry.id };
  } else {
    plan.span = { from, to, fromUs: now, untilUs: Math.min(anchor, now + Math.round(step / rate * 1_000_000)), rate,
      ...(step === distance ? { endsAt: "corner" } : {}) };
  }
  return plan;
}

export function completeRouteSpan(unit: Mobile, span: RouteSpan, roll: () => number) {
  const regions = (unit.insideRegions ?? []).filter(id => contains(waypointRegions[id], unit));
  if (span.endsAt === "corner") unit.path?.shift();
  if (typeof span.endsAt === "number") {
    regions.push(span.endsAt);
    unit.waypoint = chooseWaypoint(span.endsAt, unit.previousWaypoint, roll);
    unit.previousWaypoint = span.endsAt;
    delete unit.path;
  }
  unit.insideRegions = regions;
}

export function routeSpansOverlap(unit: Mobile, span: RouteSpan, other: Obstacle, otherSpan: RouteSpan) {
  const start = span.fromUs;
  const end = Math.max(span.untilUs, otherSpan.untilUs);
  const radius = unit.radius + other.radius;
  const maximum = radius + Math.hypot(span.to.x - unit.x, span.to.y - unit.y) + Math.hypot(otherSpan.to.x - other.x, otherSpan.to.y - other.y);
  if ((unit.x - other.x) ** 2 + (unit.y - other.y) ** 2 >= maximum ** 2) return false;
  const split = Math.max(start, Math.min(span.untilUs, otherSpan.untilUs));
  const relative = (atUs: number): Point => {
    const position = routeSpanPoint(span, atUs);
    const counterpart = routeSpanPoint(otherSpan, atUs);
    return { x: position.x - counterpart.x, y: position.y - counterpart.y };
  };
  const first = relative(start);
  const second = relative(split);
  const last = relative(end);
  const collides = (from: Point, to: Point) => {
    const overlapping = from.x ** 2 + from.y ** 2 < radius ** 2;
    if (overlapping && unit.initialOverlaps.includes(other.id) && from.x * (to.x - from.x) + from.y * (to.y - from.y) >= 0) return false;
    return segmentDistanceSquared(from, to, { x: 0, y: 0 }) < radius ** 2;
  };
  return collides(first, second) || collides(second, last);
}

export function movementCandidates(obstacles: readonly Obstacle[]): Obstacles {
  return obstacles.length >= 32 ? movementIndex(obstacles).query : obstacles;
}

export function moveAlongRoute(unit: Mobile, others: Obstacles, roll: () => number, blocked: readonly Rect[] = []) {
  let remaining = movementRate(unit) / 32;
  if (!(remaining > 0)) return;
  const sweep = movementSweep(unit, others, blocked);
  unit.insideRegions ??= waypointRegions.flatMap((region, id) => contains(region, unit) ? [id] : []);
  while (remaining > 1e-8) {
    const target = map.waypoints[unit.waypoint];
    if (!unit.path?.length || !sweep(unit, unit.path[0])) {
      unit.path = findPath(unit, target, sweep)?.points.map(({ x, y }) => ({ x, y }));
    }
    const next = unit.path?.[0];
    if (!next) return;
    const distance = Math.hypot(next.x - unit.x, next.y - unit.y);
    if (distance <= 1e-8) {
      unit.path!.shift();
      if (!unit.path!.length) return;
      continue;
    }

    const step = Math.min(remaining, distance);
    const point = { x: unit.x + (next.x - unit.x) * step / distance, y: unit.y + (next.y - unit.y) * step / distance };
    let entry: { t: number; id: number } | undefined;
    for (const [id, region] of waypointRegions.entries()) {
      if (unit.insideRegions.includes(id)) continue;
      const t = segmentEntry(unit, point, region);
      if (t !== undefined && (entry === undefined || t < entry.t)) entry = { t, id };
    }
    if (entry) {
      const t = entry.t;
      unit.x += (point.x - unit.x) * t;
      unit.y += (point.y - unit.y) * t;
      remaining -= step * t;
      unit.insideRegions = [...unit.insideRegions.filter(id => contains(waypointRegions[id], unit)), entry.id];
      unit.waypoint = chooseWaypoint(entry.id, unit.previousWaypoint, roll);
      unit.previousWaypoint = entry.id;
      unit.path = undefined;
    } else {
      unit.x = point.x;
      unit.y = point.y;
      remaining -= step;
      unit.insideRegions = unit.insideRegions.filter(id => contains(waypointRegions[id], unit));
      if (step === distance) unit.path!.shift();
    }
  }
}

export function moveUnits(units: Mobile[], roll: () => number, blocked: readonly Rect[] = [],
  occupants: readonly Obstacle[] = [], phasing?: ReadonlySet<number>) {
  const obstacles = phasing?.size ? units.filter(unit => !phasing.has(unit.id)) : units;
  const others = occupants.length ? [...obstacles, ...occupants] : obstacles;
  const index = others.length >= 32 ? movementIndex(others, true) : undefined;
  const byId = index ? new Map(others.map(unit => [unit.id, unit])) : undefined;
  for (const unit of units) {
    const phased = phasing?.has(unit.id);
    moveAlongRoute(unit, phased ? [] : index?.query ?? others, roll, blocked);
    if (!phased) index?.update(unit);
    if (unit.initialOverlaps.length) {
      unit.initialOverlaps = unit.initialOverlaps.filter(id => {
        const other = byId ? byId.get(id) : others.find(candidate => candidate.id === id);
        return other !== undefined && overlaps(unit, other);
      });
    }
  }
}

function movementIndex(obstacles: readonly Obstacle[], moving = false) {
  const layers: Record<MovementLayer, Map<number, Obstacle[]>> = { ground: new Map(), fly: new Map() };
  const bounds = moving ? new Map<Obstacle, [number, number, number, number]>() : undefined;
  const grid = (position: number) => Math.floor(position / 128);
  const key = (x: number, y: number) => y * 1024 + x;
  function update(obstacle: Obstacle) {
    const minX = grid(obstacle.x - obstacle.radius), maxX = grid(obstacle.x + obstacle.radius);
    const minY = grid(obstacle.y - obstacle.radius), maxY = grid(obstacle.y + obstacle.radius);
    const old = bounds?.get(obstacle);
    if (old && old[0] === minX && old[1] === minY && old[2] === maxX && old[3] === maxY) return;
    const layer = layers[obstacle.layer];
    if (old) {
      for (let y = old[1]; y <= old[3]; y++) {
        for (let x = old[0]; x <= old[2]; x++) {
          const occupants = layer.get(key(x, y))!;
          occupants.splice(occupants.indexOf(obstacle), 1);
        }
      }
    }
    bounds?.set(obstacle, [minX, minY, maxX, maxY]);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const id = key(x, y);
        const occupants = layer.get(id);
        if (occupants) occupants.push(obstacle);
        else layer.set(id, [obstacle]);
      }
    }
  }
  for (const obstacle of obstacles) update(obstacle);
  function* query(layer: MovementLayer, minX: number, minY: number, maxX: number, maxY: number) {
    const cells = layers[layer];
    const left = grid(minX), right = grid(maxX), top = grid(maxY);
    for (let y = grid(minY); y <= top; y++) {
      for (let x = left; x <= right; x++) {
        const occupants = cells.get(key(x, y));
        if (occupants) yield* occupants;
      }
    }
  }
  return { update, query };
}
