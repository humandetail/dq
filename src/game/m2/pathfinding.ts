import { containsDisk, gridSize, map, segmentEntry, type MovementLayer, type Point, type Rect } from "./map.ts";

const directions = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const columns = (map.bounds.maxX - map.bounds.minX) / gridSize;
const rows = (map.bounds.maxY - map.bounds.minY) / gridSize;
const gridCost = 10 / gridSize;
const cell = (x: number, y: number) => y * columns + x;
const inGrid = (x: number, y: number) => x >= 0 && x < columns && y >= 0 && y < rows;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (id: number) => ({
  x: map.bounds.minX + (id % columns + .5) * gridSize,
  y: map.bounds.minY + (Math.floor(id / columns) + .5) * gridSize,
});

export function segmentDistanceSquared(start: Point, end: Point, target: Point) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const squared = dx * dx + dy * dy;
  const t = squared ? Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / squared)) : 0;
  return (start.x + dx * t - target.x) ** 2 + (start.y + dy * t - target.y) ** 2;
}

function rectDistanceSquared(start: Point, end: Point, rect: Rect) {
  if (segmentEntry(start, end, rect) !== undefined) return 0;
  const fromPoint = ({ x, y }: Point) => (x - Math.max(rect.minX, Math.min(x, rect.maxX))) ** 2 +
    (y - Math.max(rect.minY, Math.min(y, rect.maxY))) ** 2;
  return Math.min(fromPoint(start), fromPoint(end), ...[rect.minX, rect.maxX].flatMap(x =>
    [rect.minY, rect.maxY].map(y => segmentDistanceSquared(start, end, { x, y }))));
}

export function staticSweep(start: Point, end: Point, radius: number, layer: MovementLayer, blocked: readonly Rect[] = []) {
  if (![start, end].every(point => containsDisk(map.bounds, { ...point, radius }) &&
    point.x + radius < map.bounds.maxX && point.y + radius < map.bounds.maxY)) return false;
  return layer === "fly" || [...map.obstacles, ...blocked].every(rect => rectDistanceSquared(start, end, rect) >= radius ** 2);
}

type Sweep = (from: Point, to: Point) => boolean;
type Node = { id: number; cost: number; h: number };
const before = (a: Node, b: Node) => (a.cost + a.h) - (b.cost + b.h) || a.h - b.h || a.id - b.id;

function push(open: Node[], node: Node) {
  let index = open.length;
  open.push(node);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (before(open[parent], node) <= 0) break;
    open[index] = open[parent];
    index = parent;
  }
  open[index] = node;
}

function pop(open: Node[]) {
  const first = open[0];
  const last = open.pop()!;
  if (!open.length) return first;
  let index = 0;
  while (index * 2 + 1 < open.length) {
    let child = index * 2 + 1;
    if (child + 1 < open.length && before(open[child + 1], open[child]) < 0) child++;
    if (before(last, open[child]) <= 0) break;
    open[index] = open[child];
    index = child;
  }
  open[index] = last;
  return first;
}

function connectors(point: Point, legal: (center: Point) => boolean) {
  const x = Math.floor((point.x - map.bounds.minX) / gridSize);
  const y = Math.floor((point.y - map.bounds.minY) / gridSize);
  return [[0, 0], ...directions].flatMap(([dx, dy]) => {
    if (!inGrid(x + dx, y + dy)) return [];
    const id = cell(x + dx, y + dy);
    const candidate = center(id);
    return legal(candidate) ? [{ id, cost: distance(point, candidate) * gridCost }] : [];
  }).sort((a, b) => a.id - b.id);
}

export function findPath(start: Point, goal: Point, sweep: Sweep) {
  const starts = connectors(start, point => sweep(start, point));
  const ends = connectors(goal, point => sweep(point, goal));
  if (!starts.length || !ends.length) return;
  const endCosts = new Map(ends.map(end => [end.id, end.cost]));
  const endIndex = columns * rows;
  const costs = new Float64Array(endIndex + 1).fill(Infinity);
  const parents = new Int32Array(endIndex + 1).fill(-1);
  const open: Node[] = [];
  function offer(id: number, cost: number, parent: number) {
    if (cost >= costs[id]) return;
    costs[id] = cost;
    parents[id] = parent;
    const h = id === endIndex ? 0 : Math.min(...ends.map(end => {
      const x = Math.abs(id % columns - end.id % columns);
      const y = Math.abs(Math.floor(id / columns) - Math.floor(end.id / columns));
      return 10 * Math.max(x, y) + 4 * Math.min(x, y) + end.cost;
    }));
    push(open, { id, cost, h });
  }
  for (const start of starts) offer(start.id, start.cost, -1);
  while (open.length) {
    const { id, cost } = pop(open);
    if (cost !== costs[id]) continue;
    if (id === endIndex) {
      const path = [goal];
      for (let index = parents[id]; index >= 0; index = parents[index]) path.push(center(index));
      return { points: path.reverse(), cost };
    }
    const endCost = endCosts.get(id);
    if (endCost !== undefined) offer(endIndex, cost + endCost, id);
    const point = center(id);
    const x = id % columns, y = Math.floor(id / columns);
    for (const [dx, dy] of directions) {
      if (!inGrid(x + dx, y + dy)) continue;
      const next = cell(x + dx, y + dy);
      const diagonal = !!(dx && dy);
      const total = cost + (diagonal ? 14 : 10);
      if (total >= costs[next]) continue;
      if (diagonal && (!sweep(point, center(cell(x + dx, y))) || !sweep(point, center(cell(x, y + dy))))) continue;
      if (sweep(point, center(next))) offer(next, total, id);
    }
  }
}

export function nearestSpawn(point: Point, radius: number, layer: MovementLayer) {
  if (staticSweep(point, point, radius, layer)) return point;
  let chosen: Point | undefined;
  let best = Infinity;
  for (let id = 0; id < columns * rows; id++) {
    const candidate = center(id);
    const delta = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (delta < best && staticSweep(candidate, candidate, radius, layer)) {
      best = delta;
      chosen = candidate;
    }
  }
  if (!chosen) throw new Error("M2 map has no legal spawn cell");
  return chosen;
}

export function findApproachPath(start: Point, target: Point, range: number, sweep: Sweep) {
  const x = Math.floor((target.x - map.bounds.minX) / gridSize);
  const y = Math.floor((target.y - map.bounds.minY) / gridSize);
  const span = Math.ceil(range / gridSize);
  let best: ReturnType<typeof findPath>;
  for (let row = y - span; row <= y + span; row++) {
    for (let col = x - span; col <= x + span; col++) {
      if (!inGrid(col, row)) continue;
      const point = center(cell(col, row));
      if (distance(point, target) > range) continue;
      const path = findPath(start, point, sweep);
      if (path && (!best || path.cost < best.cost)) best = path;
    }
  }
  return best?.points;
}
