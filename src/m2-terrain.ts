import * as THREE from "three";
import { gridSize, map, pathing, roadEdges, roadWidth, terrain, type Point, type Rect } from "./game/m2/map.ts";
import { loadM2ModelSource } from "./m2-models.ts";

const world = (value: number) => value / 100;

type Placement = Point & { elevation: number; angle: number; scale: number | number[] };

async function addDoodads(scene: THREE.Scene, id: "terrain-tree" | "terrain-plant", placements: Placement[]) {
  const { model, textures, entry } = await loadM2ModelSource(id);
  const maps = new Map(textures.map(([name, image]) => {
    const texture = new THREE.DataTexture(image.data, image.width, image.height);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return [name, texture] as const;
  }));

  const transform = new THREE.Object3D();
  for (const part of model.Geosets) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(part.Vertices, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(part.Normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(part.TVertices[0], 2));
    geometry.setIndex(new THREE.BufferAttribute(part.Faces, 1));
    geometry.rotateX(-Math.PI / 2);

    const layer = model.Materials[part.MaterialID].Layers[0];
    const texture = maps.get(model.Textures[layer.TextureID as number].Image)!;
    // Trees share opaque cutouts across instances. The vegetation model is a flat blended ground decal.
    const material = id === "terrain-tree"
      ? new THREE.MeshBasicMaterial({ map: texture, alphaTest: .23, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const instances = new THREE.InstancedMesh(geometry, material, placements.length);
    for (const [index, point] of placements.entries()) {
      transform.position.set(world(point.x), point.elevation, world(point.y));
      transform.rotation.y = point.angle;
      if (typeof point.scale === "number") transform.scale.setScalar(point.scale * entry.scale);
      else transform.scale.set(world(point.scale[0]), world(point.scale[2]), world(point.scale[1]));
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    }
    scene.add(instances);
  }
}

async function addOriginalTerrain(scene: THREE.Scene, source: NonNullable<typeof terrain>, materials: THREE.CanvasTexture[]) {
  const { columns, rows } = source;
  const samples = atob(source.ground);
  const pixelsPerTile = 16;
  const width = (columns - 1) * pixelsPerTile, height = (rows - 1) * pixelsPerTile;
  const ground = document.createElement("canvas");
  ground.width = width;
  ground.height = height;
  const paint = ground.getContext("2d")!;
  const layer = ground.cloneNode() as HTMLCanvasElement;
  const blend = layer.getContext("2d")!;
  const samplesCanvas = document.createElement("canvas");
  samplesCanvas.width = columns;
  samplesCanvas.height = rows;
  const sampleContext = samplesCanvas.getContext("2d")!;
  const alpha = sampleContext.createImageData(columns, rows);
  const pixelsPerUnit = width / (map.bounds.maxX - map.bounds.minX);
  for (const [index, material] of materials.entries()) {
    const context = index === 0 ? paint : blend;
    context.save();
    if (index > 0) {
      for (let cell = 0; cell < samples.length; cell++) alpha.data[cell * 4 + 3] = samples.charCodeAt(cell) === index ? 255 : 0;
      sampleContext.putImageData(alpha, 0, 0);
      context.clearRect(0, 0, width, height);
      context.drawImage(samplesCanvas, -pixelsPerTile / 2, -pixelsPerTile / 2, width + pixelsPerTile, height + pixelsPerTile);
      context.globalCompositeOperation = "source-in";
    }
    const pattern = context.createPattern(material.image, "repeat")!;
    pattern.setTransform(new DOMMatrix().scale(pixelsPerTile / material.image.width));
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
    context.restore();
    if (index > 0) paint.drawImage(layer, 0, 0);
  }

  const allowed = new Path2D();
  allowed.rect(0, 0, width, height);
  for (const area of pathing!.build) {
    allowed.rect((area.minX - map.bounds.minX) * pixelsPerUnit, (area.minY - map.bounds.minY) * pixelsPerUnit,
      (area.maxX - area.minX) * pixelsPerUnit, (area.maxY - area.minY) * pixelsPerUnit);
  }
  paint.fillStyle = "rgba(161, 208, 107, .16)";
  paint.fill(allowed, "evenodd");

  const texture = new THREE.CanvasTexture(ground);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.PlaneGeometry(world(map.bounds.maxX - map.bounds.minX),
    world(map.bounds.maxY - map.bounds.minY), columns - 1, rows - 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  mesh.position.set(world((map.bounds.minX + map.bounds.maxX) / 2), world(source.height) - .012,
    world((map.bounds.minY + map.bounds.maxY) / 2));
  scene.add(mesh);

  const placements = (id: string) => source.doodads.filter(doodad => doodad.id === id).map(doodad => ({
    x: doodad.position[0], y: doodad.position[1], elevation: world(doodad.position[2]),
    angle: doodad.angleRadians, scale: doodad.scale,
  }));
  const trees = placements("D005"), plants = placements("D002");
  await Promise.all([addDoodads(scene, "terrain-tree", trees), addDoodads(scene, "terrain-plant", plants)]);
  return { cellsX: columns - 1, cellsY: rows - 1, trees: trees.length, plants: plants.length };
}

export async function addM2Terrain(scene: THREE.Scene) {
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
  if (terrain) return addOriginalTerrain(scene, terrain, [grass, cliff, clay]);
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
  for (const obstacle of map.obstacles) slab(obstacle, .32, .35, cliff);

  const { minX, maxX, minY, maxY } = map.bounds;
  const cellsX = (maxX - minX) / gridSize, cellsY = (maxY - minY) / gridSize;
  const pixelsPerCell = 12;
  const pixelScale = pixelsPerCell / gridSize;
  const ground = document.createElement("canvas");
  ground.width = cellsX * pixelsPerCell;
  ground.height = cellsY * pixelsPerCell;
  const groundContext = ground.getContext("2d")!;
  const mask = document.createElement("canvas");
  mask.width = ground.width;
  mask.height = ground.height;
  const layer = mask.getContext("2d")!;
  const x = (value: number) => (value - minX) * pixelScale;
  const y = (value: number) => (value - minY) * pixelScale;
  function tile(context: CanvasRenderingContext2D, image: THREE.CanvasTexture) {
    const pattern = context.createPattern(image.image, "repeat")!;
    pattern.setTransform(new DOMMatrix().scale(200 * pixelScale / image.image.width));
    context.fillStyle = pattern;
    context.fillRect(0, 0, ground.width, ground.height);
  }
  function paint(image: THREE.CanvasTexture, draw: () => void) {
    layer.clearRect(0, 0, mask.width, mask.height);
    layer.save();
    layer.filter = "blur(1.5px)";
    draw();
    layer.filter = "none";
    layer.globalCompositeOperation = "source-in";
    tile(layer, image);
    layer.restore();
    groundContext.drawImage(mask, 0, 0);
  }
  tile(groundContext, grass);
  paint(slate, () => {
    for (const area of map.buildAreas)
      layer.fillRect(x(area.minX), y(area.minY), (area.maxX - area.minX) * pixelScale, (area.maxY - area.minY) * pixelScale);
  });
  paint(clay, () => {
    layer.lineWidth = roadWidth * pixelScale;
    layer.lineCap = "square";
    layer.beginPath();
    for (const [from, to] of roadEdges) {
      layer.moveTo(x(from.x), y(from.y));
      layer.lineTo(x(to.x), y(to.y));
    }
    layer.stroke();
  });
  const groundTexture = new THREE.CanvasTexture(ground);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.anisotropy = 4;
  const geometry = new THREE.PlaneGeometry(world(maxX - minX), world(maxY - minY), cellsX, cellsY);
  geometry.rotateX(-Math.PI / 2);
  const surfaceMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 }));
  surfaceMesh.position.set(world((minX + maxX) / 2), -.012, world((minY + maxY) / 2));
  scene.add(surfaceMesh);

  const rock = new THREE.MeshStandardMaterial({ map: cliff, color: "#a99986", flatShading: true });
  const rockShape = new THREE.DodecahedronGeometry(.35, 0);
  const boundaryTrees = 26;
  const trees: Placement[] = [];
  const plants: Placement[] = [];
  const rocks = new THREE.InstancedMesh(rockShape, rock, boundaryTrees);
  const transform = new THREE.Object3D();
  function put(mesh: THREE.InstancedMesh, index: number) {
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }
  for (const area of map.obstacles) {
    for (const fraction of [.22, .52, .8]) {
      const x = (area.minX + area.maxX) / 2 + (random() - .5) * 44;
      const y = area.minY + fraction * (area.maxY - area.minY);
      trees.push({ x, y, elevation: .32, angle: random() * Math.PI * 2, scale: 1.15 + random() * .25 });
      plants.push({ x, y, elevation: .33, angle: random() * Math.PI * 2, scale: 1.1 });
    }
  }
  for (let i = 0; i < boundaryTrees; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (1340 + random() * 21);
    const y = minY + 75 + (maxY - minY - 150) * (Math.floor(i / 2) + random()) / (boundaryTrees / 2);
    trees.push({ x, y, elevation: -.012, angle: random() * Math.PI * 2, scale: .72 + random() * .28 });
    plants.push({ x: x - side * 9, y: y + 38, elevation: -.005, angle: random() * Math.PI * 2, scale: 1 });
    transform.position.set(world(x) + .16, .12, world(y) + .35);
    transform.scale.set(.5 + random(), .55, .5 + random());
    transform.rotation.y = random() * 6;
    put(rocks, i);
  }
  scene.add(rocks);

  const border = map.containment;
  const borderPoints: Point[] = [
    { x: border.minX, y: border.minY }, { x: border.maxX, y: border.minY },
    { x: border.maxX, y: border.maxY }, { x: border.minX, y: border.maxY },
  ];
  const stone = new THREE.MeshStandardMaterial({ color: "#b2a184", map: cliff });
  const post = new THREE.CylinderGeometry(.11, .17, .31, 6);
  const posts = new THREE.InstancedMesh(post, stone, borderPoints.length * 13);
  transform.rotation.y = 0;
  transform.scale.setScalar(1);
  for (let edge = 0; edge < borderPoints.length; edge++) {
    const a = borderPoints[edge], b = borderPoints[(edge + 1) % borderPoints.length];
    for (let i = 0; i < 13; i++) {
      transform.position.set(world(a.x + (b.x - a.x) * i / 13), .14, world(a.y + (b.y - a.y) * i / 13));
      put(posts, edge * 13 + i);
    }
  }
  scene.add(posts);

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
  await Promise.all([addDoodads(scene, "terrain-tree", trees), addDoodads(scene, "terrain-plant", plants)]);
  return { cellsX, cellsY, trees: trees.length, plants: plants.length };
}
