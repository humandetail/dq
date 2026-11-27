import battlefield from "#battlefield";

export type Point = { x: number; y: number };
export type Rect = { minX: number; maxX: number; minY: number; maxY: number };
export type Disk = Point & { radius: number };
export type MovementLayer = "ground" | "fly";

export const gridSize = 32;

export type Battlefield = {
  version: string;
  roadWidth: number;
  map: {
    bounds: Rect; containment: Rect; buildAreas: Rect[]; obstacles: Rect[];
    entry: Point; entryWaypoint: number; activityEntry: Point; activityWaypoint: number;
    worker: Point; energyCircle: Point; runeAnchor: Point;
    waypoints: (Point & { next: number[] })[];
  };
  regions: Rect[];
  pathing?: { ground: Rect[]; fly: Rect[]; build: Rect[] };
  terrain?: {
    columns: number; rows: number; ground: string; height: number;
    doodads: { id: string; position: number[]; angleRadians: number; scale: number[] }[];
  };
};

const selected: Battlefield = battlefield;
export const { map, version: mapVersion, roadWidth, regions: waypointRegions, terrain, pathing } = selected;

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

export function terrainAllowsConstruction(point: Point) {
  if (!pathing) return map.buildAreas.some(area => contains(area, point)) && !map.obstacles.some(area => contains(area, point));
  const { x, y } = point;
  const { minX, minY, maxX, maxY } = map.bounds;
  return x >= minX && x < maxX && y >= minY && y < maxY &&
    !pathing.build.some(area => x >= area.minX && x < area.maxX && y >= area.minY && y < area.maxY);
}

export function buildAnchor(point: Point, radius: number, occupied: readonly Disk[],
  footprints: readonly Rect[] = [], withFootprint = false, snap = true) {
  if (!terrainAllowsConstruction(point) || !Number.isFinite(radius) || radius <= 0) return;
  if (footprints.some(area => contains(area, point))) return;
  const disk = {
    x: snap ? Math.round(point.x / gridSize) * gridSize : point.x,
    y: snap ? Math.round(point.y / gridSize) * gridSize : point.y,
    radius,
  };
  if (!map.buildAreas.some(area => containsDisk(area, disk))) return;
  const blocked = [...(pathing?.build ?? map.obstacles), ...footprints];
  if (pathing && (disk.x + radius >= map.bounds.maxX || disk.y + radius >= map.bounds.maxY)) return;
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
  if (candidates.length === 0) return undefined;
  return candidates.length === 1 ? candidates[0] : candidates[Math.floor(roll() * candidates.length)];
}


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
