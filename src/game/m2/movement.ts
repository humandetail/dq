import { chooseWaypoint, contains, map, overlaps, segmentEntry, waypointRegions, type Disk, type MovementLayer, type Point, type Rect } from "./map.ts";
import { findPath, segmentDistanceSquared, staticSweep } from "./pathfinding.ts";

export type Mobile = Disk & {
  id: number;
  layer: MovementLayer;
  speed: number;
  speedBuff?: number;
  auraSpeed?: number;
  purge?: { middleUs: number; endUs: number; factor: number };
  clapSlow?: { untilUs: number; factor: number };
  stunUntilUs?: number;
  leashes?: number[];
  frost?: { factor: number; expiresUs: number };
  previousWaypoint: number | null;
  waypoint: number;
  initialOverlaps: number[];
  insideRegions?: number[];
  path?: Point[];
};

export const movementStepUs = 31_250;

export function movementSweep(unit: Mobile, obstacles: readonly Pick<Mobile, "id" | "layer" | "x" | "y" | "radius">[], blocked: readonly Rect[] = []) {
  return (from: Point, to: Point) => {
    if (!staticSweep(from, to, unit.radius, unit.layer, blocked)) return false;
    const dx = to.x - from.x, dy = to.y - from.y;
    return obstacles.every(other => {
      if (other.id === unit.id || other.layer !== unit.layer) return true;
      const radius = unit.radius + other.radius;
      if (other.x + radius <= Math.min(from.x, to.x) || other.x - radius >= Math.max(from.x, to.x) ||
        other.y + radius <= Math.min(from.y, to.y) || other.y - radius >= Math.max(from.y, to.y)) return true;
      const sx = from.x - other.x, sy = from.y - other.y;
      if (sx * sx + sy * sy < radius ** 2 && unit.initialOverlaps.includes(other.id) &&
        sx * dx + sy * dy >= 0 && (dx !== 0 || dy !== 0)) return true;
      return segmentDistanceSquared(from, to, other) >= radius ** 2;
    });
  };
}

export function moveAlongRoute(unit: Mobile, others: Parameters<typeof movementSweep>[1], roll: () => number, blocked: readonly Rect[] = []) {
  const speed = unit.speed * (unit.frost?.factor ?? 1) * (unit.speedBuff ?? 1) *
    (unit.auraSpeed ?? 1) * (unit.clapSlow?.factor ?? 1);
  const reduced = unit.purge && speed > 0 ? Math.max(50, speed * unit.purge.factor) : speed;
  let remaining = unit.stunUntilUs || unit.leashes?.length ? 0 : reduced / 32;
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
  occupants: Parameters<typeof movementSweep>[1] = []) {
  const others = occupants.length ? [...units, ...occupants] : units;
  for (const unit of units) {
    moveAlongRoute(unit, others, roll, blocked);
    if (unit.initialOverlaps.length) {
      unit.initialOverlaps = unit.initialOverlaps.filter(id => {
        const other = units.find(candidate => candidate.id === id);
        return other !== undefined && overlaps(unit, other);
      });
    }
  }
}
