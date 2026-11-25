import * as THREE from "three";
import { map, roadEdges, roadWidth, type Point, type Rect } from "./game/m2/map.ts";

const world = (value: number) => value / 100;

export function addM2Terrain(scene: THREE.Scene) {
  let state = 0x3a7e26;
  function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  }

  function texture(base: string, accents: string[], stone = false) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      ctx.fillStyle = accents[Math.floor(random() * accents.length)];
      ctx.globalAlpha = .13 + random() * .38;
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 7, 1 + random() * 5);
    }
    if (stone) {
      ctx.globalAlpha = .26;
      ctx.strokeStyle = "#231c15";
      for (let y = 0; y < 256; y += 32) {
        for (let x = -32; x < 256; x += 56) ctx.strokeRect(x + (y % 64) / 2, y, 56, 32);
      }
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.anisotropy = 4;
    return result;
  }

  const grass = texture("#46652b", ["#89994d", "#213b29", "#a5ab5e", "#3f5139"]);
  const clay = texture("#97805d", ["#c4a375", "#61573c", "#b39167", "#786647"]);
  const slate = texture("#597e34", ["#a6a075", "#454f35", "#827659"], true);
  const cliff = texture("#534738", ["#857364", "#38372a", "#637349"], true);
  const water = texture("#29494b", ["#526c59", "#31515a", "#415d5b"]);
  const surface = (image: THREE.Texture, u: number, v: number) => {
    const tiled = image.clone();
    tiled.repeat.set(Math.max(1, u), Math.max(1, v));
    return new THREE.MeshStandardMaterial({ map: tiled, roughness: 1 });
  };

  function slab(area: Rect, top: number, thickness: number, image: THREE.Texture) {
    const width = world(area.maxX - area.minX), depth = world(area.maxY - area.minY);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), surface(image, width / 2, depth / 2));
    mesh.position.set(world((area.minX + area.maxX) / 2), top - thickness / 2, world((area.minY + area.maxY) / 2));
    scene.add(mesh);
  }

  slab({ minX: -1900, maxX: 1900, minY: -1800, maxY: 1800 }, -.65, .2, water);
  slab(map.bounds, -.036, .62, cliff);
  slab(map.bounds, -.026, .08, grass);
  for (const area of map.buildAreas) {
    slab(area, -.011, .05, slate);
  }
  for (const obstacle of map.obstacles) slab(obstacle, .32, .35, cliff);

  for (const [from, to] of roadEdges) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(world(length) + world(roadWidth), world(roadWidth)), surface(clay, world(length) / 1.6, 1));
    road.rotation.set(-Math.PI / 2, 0, -Math.atan2(to.y - from.y, to.x - from.x), "XYZ");
    road.position.set(world((from.x + to.x) / 2), .005, world((from.y + to.y) / 2));
    scene.add(road);
  }

  const foliage = new THREE.MeshStandardMaterial({ color: "#395837", flatShading: true });
  const bark = new THREE.MeshStandardMaterial({ color: "#513c2e" });
  const rock = new THREE.MeshStandardMaterial({ map: cliff, color: "#a99986", flatShading: true });
  const trunkShape = new THREE.CylinderGeometry(.055, .09, .6, 5);
  const crownShape = new THREE.ConeGeometry(.34, .8, 6);
  const rockShape = new THREE.DodecahedronGeometry(.35, 0);
  function tree(x: number, y: number, ground: number, height: number) {
    const trunk = new THREE.Mesh(trunkShape, bark);
    trunk.position.set(world(x), ground + .3 * height, world(y));
    trunk.scale.setScalar(height);
    scene.add(trunk);
    for (const level of [0, 1, 2]) {
      const crown = new THREE.Mesh(crownShape, foliage);
      crown.position.set(world(x), ground + (.6 + level * .22) * height, world(y));
      crown.scale.setScalar(height * (1 - .18 * level));
      crown.rotation.y = random() * Math.PI;
      scene.add(crown);
    }
  }
  for (const area of map.obstacles) {
    for (let i = 0; i < 11; i++) {
      tree(area.minX + 15 + random() * (area.maxX - area.minX - 30),
        area.minY + 15 + random() * (area.maxY - area.minY - 30), .32, .65 + random() * .9);
    }
  }
  for (let i = 0; i < 52; i++) {
    const x = i % 2 ? -1380 + random() * 65 : 1315 + random() * 65;
    const y = -1320 + random() * 2640;
    tree(x, y, -.01, .55 + random() * .65);
    const stone = new THREE.Mesh(rockShape, rock);
    stone.position.set(world(x) + .16, .12, world(y) + .35);
    stone.scale.set(.5 + random(), .55, .5 + random());
    stone.rotation.y = random() * 6;
    scene.add(stone);
  }

  const border = map.containment;
  const borderPoints: Point[] = [
    { x: border.minX, y: border.minY }, { x: border.maxX, y: border.minY },
    { x: border.maxX, y: border.maxY }, { x: border.minX, y: border.maxY },
  ];
  const stone = new THREE.MeshStandardMaterial({ color: "#b2a184", map: cliff });
  const post = new THREE.CylinderGeometry(.11, .17, .31, 6);
  for (let edge = 0; edge < borderPoints.length; edge++) {
    const a = borderPoints[edge], b = borderPoints[(edge + 1) % borderPoints.length];
    for (let i = 0; i < 13; i++) {
      const body = new THREE.Mesh(post, stone);
      body.position.set(world(a.x + (b.x - a.x) * i / 13), .14, world(a.y + (b.y - a.y) * i / 13));
      scene.add(body);
    }
  }

  const portalStone = new THREE.MeshStandardMaterial({ color: "#8c8171", map: cliff });
  const ember = new THREE.MeshStandardMaterial({ color: "#deba79", emissive: "#ae5d32", emissiveIntensity: .8 });
  for (const point of [map.entry, map.activityEntry]) {
    for (const x of [-.37, .37]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(.2, .62, .29), portalStone);
      column.position.set(world(point.x) + x, .32, world(point.y));
      scene.add(column);
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(.12), ember);
      flame.position.set(world(point.x) + x, .71, world(point.y));
      scene.add(flame);
    }
  }
}
