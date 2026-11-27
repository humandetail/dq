import type { Battlefield, Point, Rect } from "./map.ts";

// User reference: nested rectangular roads, connected junctions, grass between roads.
const version = "m2-map-5";
const roadWidth = 96;
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
const map = {
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

export default { version, map, roadWidth, regions: waypoints.map(({ x, y }) => ({
  minX: x - 12, maxX: x + 12, minY: y - 12, maxY: y + 12,
})) } satisfies Battlefield;
