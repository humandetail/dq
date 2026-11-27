import data from "./original-battlefield.json" with { type: "json" };
import type { Battlefield, Rect } from "./map.ts";

const rectangle = ([minX, minY, maxX, maxY]: readonly number[]): Rect => ({ minX, minY, maxX, maxY });
const point = ([x, y]: readonly number[]) => ({ x, y });
const bounds = rectangle(data.bounds);
const source = data.waypoints as [number[], number[]][];
const regions = source.map(([area]) => rectangle(area));
const waypoints = source.map(([area, next]) => {
  const [x, y, right, top] = area;
  return { x: (x + right) / 2, y: (y + top) / 2, next };
});

export default {
  version: "m3-map-6.25",
  roadWidth: 128,
  map: {
    bounds, containment: bounds, buildAreas: [bounds], obstacles: [],
    entry: point(data.spawn), entryWaypoint: 0,
    activityEntry: point(data.spawn), activityWaypoint: 0,
    worker: point(data.worker), energyCircle: point(data.circle), runeAnchor: point(data.circle),
    waypoints,
  },
  regions,
  pathing: {
    ground: data.pathing.ground.map(rectangle),
    fly: data.pathing.fly.map(rectangle),
    build: data.pathing.build.map(rectangle),
  },
  terrain: { columns: data.vertices[0], rows: data.vertices[1], ground: data.ground, height: 0, doodads: data.doodads },
} satisfies Battlefield;
