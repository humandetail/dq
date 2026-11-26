export type Point = { x: number; y: number };
export type Rect = { minX: number; maxX: number; minY: number; maxY: number };
export type Disk = Point & { radius: number };
export type MovementLayer = "ground" | "fly";

export const gridSize = 32;

// User reference: nested rectangular roads, connected junctions, grass between roads.
export const mapVersion = "m2-map-5";
export const roadWidth = 96;
const waypoints: Array<Point & { next: number[] }> = [
  { x: 0, y: -448, next: [1, 5] },
  { x: 480, y: -448, next: [0, 2] },
  { x: 480, y: 448, next: [1, 3] },
  { x: 0, y: 448, next: [2, 4] },
  { x: -480, y: 448, next: [3, 5] },
  { x: -480, y: -448, next: [4, 0] },
];
// Add two surrounding rings. Ordered neighbours define the seeded route choice.
for (const [x, y] of [[864, 832], [1248, 1216]]) {
  const start = waypoints.length;
  const points = [[0, -y], [x, -y], [x, y], [0, y], [-x, y], [-x, -y]];
  points.forEach(([x, y], i) => waypoints.push({ x, y, next: [start + (i + 1) % 6, start + (i + 5) % 6] }));
  for (const i of [0, 3]) {
    waypoints[start + i].next.push(start - 6 + i);
    waypoints[start - 6 + i].next.push(start + i);
  }
}
// Match the vertical connectors: outer -> middle -> inner on each side.
// Stop at the inner ring; the central courtyard stays disconnected across both axes.
for (const side of [1, -1]) {
  const junctions: number[] = [];
  for (const ring of [0, 1, 2]) {
    const a = ring * 6 + (side === 1 ? 1 : 4);
    const b = ring * 6 + (side === 1 ? 2 : 5);
    const junction = waypoints.length;
    waypoints.push({ x: waypoints[a].x, y: 0, next: [a, b] });
    waypoints[a].next = waypoints[a].next.map(id => id === b ? junction : id);
    waypoints[b].next = waypoints[b].next.map(id => id === a ? junction : id);
    junctions.push(junction);
  }
  for (let i = 1; i < junctions.length; i++) {
    const a = junctions[i - 1], b = junctions[i];
    waypoints[a].next.push(b);
    waypoints[b].next.push(a);
  }
}
const buildAreas: Rect[] = [{ minX: -384, maxX: 384, minY: -320, maxY: 320 }];
for (const [outerX, outerY, innerX, innerY] of [[864, 832, 480, 448], [1248, 1216, 864, 832]]) {
  // Insets leave a visible verge and enough room for the full 72-unit tower disk.
  for (const side of [-1, 1]) {
    const xs = [side * (innerX + 96), side * (outerX - 96)].sort((a, b) => a - b);
    const verticalPlots = [[-outerY + 96, -64], [64, outerY - 96]];
    for (const [minY, maxY] of verticalPlots) {
      buildAreas.push({ minX: xs[0], maxX: xs[1], minY, maxY });
    }
    const ys = [side * (innerY + 96), side * (outerY - 96)].sort((a, b) => a - b);
    for (const [minX, maxX] of [[-innerX + 96, -96], [96, innerX - 96]]) {
      buildAreas.push({ minX, maxX, minY: ys[0], maxY: ys[1] });
    }
  }
}
export const map = {
  bounds: { minX: -1408, maxX: 1408, minY: -1376, maxY: 1376 },
  containment: { minX: -1312, maxX: 1312, minY: -1280, maxY: 1280 },
  buildAreas,
  obstacles: [{ minX: -96, maxX: 96, minY: -160, maxY: 160 }],
  entry: { x: 0, y: -1280 },
  activityEntry: { x: 0, y: 1280 },
  entryWaypoint: 12,
  activityWaypoint: 15,
  worker: { x: -288, y: -128 },
  energyCircle: { x: -192, y: 0 },
  runeAnchor: { x: 288, y: 0 },
  waypoints,
};

export function contains(area: Rect, point: Point) {
  return area.minX <= point.x && point.x <= area.maxX &&
    area.minY <= point.y && point.y <= area.maxY;
}

export function containsDisk(area: Rect, disk: Disk) {
  return contains(area, { x: disk.x - disk.radius, y: disk.y - disk.radius }) &&
    contains(area, { x: disk.x + disk.radius, y: disk.y + disk.radius });
}

export function intersectsDisk(area: Rect, disk: Disk) {
  const x = Math.max(area.minX, Math.min(disk.x, area.maxX));
  const y = Math.max(area.minY, Math.min(disk.y, area.maxY));
  return (x - disk.x) ** 2 + (y - disk.y) ** 2 < disk.radius ** 2;
}

export function overlaps(a: Disk, b: Disk) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (a.radius + b.radius) ** 2;
}

export function buildFootprint(point: Point): Rect {
  return { minX: point.x - 64, maxX: point.x + 64, minY: point.y - 64, maxY: point.y + 64 };
}

function rectOverlap(a: Rect, b: Rect) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

export function buildAnchor(point: Point, radius: number, occupied: readonly Disk[],
  footprints: readonly Rect[] = [], withFootprint = false, snap = true) {
  if (!map.buildAreas.some(area => contains(area, point)) || !Number.isFinite(radius) || radius <= 0) return;
  if ([...map.obstacles, ...footprints].some(area => contains(area, point))) return;
  const disk = {
    x: snap ? Math.round(point.x / gridSize) * gridSize : point.x,
    y: snap ? Math.round(point.y / gridSize) * gridSize : point.y,
    radius,
  };
  if (!map.buildAreas.some(area => containsDisk(area, disk))) return;
  const blocked = [...map.obstacles, ...footprints];
  if (blocked.some(area => intersectsDisk(area, disk)) || occupied.some(body => overlaps(body, disk))) return;
  if (withFootprint) {
    const footprint = buildFootprint(disk);
    if (!map.buildAreas.some(area => area.minX <= footprint.minX && footprint.maxX <= area.maxX &&
      area.minY <= footprint.minY && footprint.maxY <= area.maxY) ||
      blocked.some(area => rectOverlap(area, footprint)) || occupied.some(body => intersectsDisk(footprint, body))) return;
  }
  return disk;
}

export function chooseWaypoint(at: number, previous: number | null, roll: () => number) {
  const candidates = map.waypoints[at].next.filter(id => id !== previous);
  return candidates.length === 1 ? candidates[0] : candidates[Math.floor(roll() * candidates.length)];
}


export const waypointRegions = map.waypoints.map(({ x, y }) => ({
  minX: x - 12, maxX: x + 12, minY: y - 12, maxY: y + 12,
}));

export function segmentEntry(from: Point, to: Point, area: Rect) {
  let enter = 0;
  let leave = 1;
  for (const [start, end, min, max] of [
    [from.x, to.x, area.minX, area.maxX], [from.y, to.y, area.minY, area.maxY],
  ]) {
    if (end === start) {
      if (start < min || start > max) return;
      continue;
    }
    const near = (min - start) / (end - start);
    const far = (max - start) / (end - start);
    enter = Math.max(enter, Math.min(near, far));
    leave = Math.min(leave, Math.max(near, far));
    if (enter > leave) return;
  }
  return enter;
}

export const roadEdges = [
  [map.entry, map.waypoints[map.entryWaypoint]], [map.activityEntry, map.waypoints[map.activityWaypoint]],
  ...map.waypoints.flatMap((from, id) => from.next.filter(to => id < to).map(to => [from, map.waypoints[to]])),
];
