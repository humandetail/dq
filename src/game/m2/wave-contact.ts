import { secondsToMicroseconds as us } from "../event-queue.ts";
import type { SpellSweep } from "./hero-spells.ts";
import type { Point } from "./map.ts";

function transverse(sweep: SpellSweep) {
  return sweep.name === "i279" || sweep.name === "A170" || sweep.name === "A001" || sweep.name === "A008" || sweep.name === "A162";
}

export function waveContact(sweep: SpellSweep, target: Point): [number, number] | undefined {
  const x = target.x - sweep.x, y = target.y - sweep.y;
  const along = x * sweep.dx + y * sweep.dy;
  const across = x * sweep.dy - y * sweep.dx;
  const slope = (sweep.radiusEnd - sweep.radiusStart) / sweep.range;
  if (transverse(sweep)) {
    // Transverse wavefronts have no damage beyond either end.
    const tolerance = Number.EPSILON * Math.max(1, sweep.range) * 4;
    if (along < -tolerance || along > sweep.range + tolerance ||
        Math.abs(across) > sweep.radiusStart + slope * along + tolerance) return;
    const contact = us(Math.max(0, Math.min(sweep.range, along)) / sweep.speed);
    return [contact, contact];
  }
  // Solve distance(center(s), target)^2 <= radius(s)^2 along the sweep.
  const quadratic = 1 - slope ** 2;
  const center = along + sweep.radiusStart * slope;
  const constant = along ** 2 + across ** 2 - sweep.radiusStart ** 2;
  const discriminant = center ** 2 - quadratic * constant;
  // Allow round-off on the discriminant of a closed tangency.
  if (discriminant < -Number.EPSILON * Math.max(center ** 2, Math.abs(quadratic * constant)) * 4) return;
  const half = Math.sqrt(Math.max(0, discriminant));
  const entry = Math.max(0, (center - half) / quadratic);
  const exit = Math.min(sweep.range, (center + half) / quadratic);
  if (entry <= exit) return [us(entry / sweep.speed), us(exit / sweep.speed)];
}

type Contact = [enterUs: number, exitUs: number];
type MotionSegment = {
  fromUs: number;
  untilUs: number;
  position: Point;
  velocity: Point;
};

// The segment position is sampled at fromUs, with velocity in world units per
// second. Both timestamps are relative to wave launch. Distinct teleport
// endpoints must be supplied as separate segments.
export function movingWaveContacts(sweep: SpellSweep, segment: MotionSegment): Contact[] {
  const start = Math.max(0, segment.fromUs);
  const end = Math.min(sweep.range / sweep.speed * 1_000_000, segment.untilUs);
  const { position, velocity } = segment;
  if (velocity.x === 0 && velocity.y === 0) {
    const fixed = waveContact(sweep, position);
    const endpoint = Math.round(end);
    if (!fixed || fixed[0] > endpoint || fixed[1] < start) return [];
    return [[Math.max(start, fixed[0]), Math.min(endpoint, fixed[1])]];
  }
  if (end < start) return [];

  const offset = (start - segment.fromUs) / 1_000_000;
  const duration = (end - start) / 1_000_000;
  const x = position.x - sweep.x + velocity.x * offset;
  const y = position.y - sweep.y + velocity.y * offset;
  const along = x * sweep.dx + y * sweep.dy;
  const across = x * sweep.dy - y * sweep.dx;
  const waveDistance = start * sweep.speed / 1_000_000;
  const alongOffset = along - waveDistance;
  const alongSpeed = velocity.x * sweep.dx + velocity.y * sweep.dy - sweep.speed;
  const acrossSpeed = velocity.x * sweep.dy - velocity.y * sweep.dx;
  const widening = (sweep.radiusEnd - sweep.radiusStart) / sweep.range;
  const width = sweep.radiusStart + widening * waveDistance;
  const widthSpeed = widening * sweep.speed;
  const result: Contact[] = [];
  const take = (from: number, to: number) => {
    const enter = Math.max(0, from);
    const exit = Math.min(duration, to);
    if (enter <= exit) result.push([start + us(enter), start + us(exit)]);
  };

  if (transverse(sweep)) {
    if (alongSpeed !== 0) {
      const crossing = -alongOffset / alongSpeed;
      const side = Math.abs(across + acrossSpeed * crossing);
      const edge = width + widthSpeed * crossing;
      const tolerance = Number.EPSILON * Math.max(1, side, Math.abs(edge)) * 4;
      if (crossing >= 0 && crossing <= duration &&
          side <= edge + tolerance) take(crossing, crossing);
    } else if (alongOffset === 0) {
      // A target riding the plane is in contact where both lateral bounds hold.
      const edge1 = linearRange(across - width, acrossSpeed - widthSpeed);
      const edge2 = linearRange(-across - width, -acrossSpeed - widthSpeed);
      if (edge1 && edge2) take(Math.max(edge1[0], edge2[0]), Math.min(edge1[1], edge2[1]));
    }
    return result;
  }

  const a = alongSpeed ** 2 + acrossSpeed ** 2 - widthSpeed ** 2;
  const b = 2 * (alongOffset * alongSpeed + across * acrossSpeed - width * widthSpeed);
  const c = alongOffset ** 2 + across ** 2 - width ** 2;
  if (a === 0) {
    const range = linearRange(c, b);
    if (range) take(...range);
    return result;
  }
  const discriminant = b ** 2 - 4 * a * c;
  const tolerance = Number.EPSILON * Math.max(b ** 2, Math.abs(4 * a * c)) * 4;
  if (discriminant < -tolerance) {
    if (a < 0) take(0, duration);
    return result;
  }
  if (Math.abs(discriminant) <= tolerance) {
    if (a < 0) take(0, duration);
    else take(-b / (2 * a), -b / (2 * a));
    return result;
  }
  // The direct quadratic formula loses the near root on fast approach.
  const q = -.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  const first = Math.min(q / a, c / q);
  const last = Math.max(q / a, c / q);
  if (a > 0) take(first, last);
  else {
    take(0, first);
    take(last, duration);
  }
  return result;
}

function linearRange(offset: number, slope: number): [number, number] | undefined {
  if (slope > 0) return [-Infinity, -offset / slope];
  if (slope < 0) return [-offset / slope, Infinity];
  if (offset <= 0) return [-Infinity, Infinity];
}
