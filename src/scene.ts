import * as THREE from "three";
import { map, type SiteId } from "./game/content.ts";
import type { Hit } from "./game/battle.ts";
import { loadM1Models, type UnitModel } from "./m1-models.ts";
import type { MatchState } from "./game/state.ts";

export type Pick = { site: SiteId } | { enemyId: number };

function paintedMaterial(color: string, accent: string) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 64;
  const paint = tile.getContext("2d")!;
  paint.fillStyle = color;
  paint.fillRect(0, 0, 64, 64);
  paint.strokeStyle = accent;
  paint.lineWidth = 2;
  paint.strokeRect(3, 3, 58, 58);
  paint.fillStyle = accent;
  for (const x of [9, 51]) {
    for (const y of [9, 51]) paint.fillRect(x, y, 4, 4);
  }
  paint.globalAlpha = 0.25;
  for (let i = 0; i < 64; i += 8) paint.fillRect(0, i, 64, 1);
  const texture = new THREE.CanvasTexture(tile);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.76 });
}

export async function createScene(canvas: HTMLCanvasElement, select: (pick: Pick) => void) {
  const models = await loadM1Models();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#102934");
  const camera = new THREE.OrthographicCamera();
  camera.position.set(9, 20, 17);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const ambient = new THREE.HemisphereLight("#d8f0ff", "#284258", 2);
  const key = new THREE.DirectionalLight("#ffe6bd", 2.5);
  key.position.set(-5, 9, 3);
  scene.add(ambient, key);

  const stone = paintedMaterial("#354d54", "#668185");
  const inlay = paintedMaterial("#2f554e", "#487269");
  const dark = new THREE.MeshStandardMaterial({ color: "#243c45", roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: "#ffde83", emissive: "#d79926", emissiveIntensity: 0.8 });
  const water = new THREE.MeshStandardMaterial({ color: "#1b4655", roughness: 0.52 });
  const place = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, height: number, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, height, y);
    scene.add(mesh);
    return mesh;
  };
  place(new THREE.BoxGeometry(48, 0.3, 35), water, 0, -0.9, 0);
  place(new THREE.BoxGeometry(14.4, 0.7, 10.4), stone, 0, -0.45, 0);
  place(new THREE.BoxGeometry(10.5, 0.12, 6.4), inlay, 0, -0.06, 0);
  for (let x = -6; x <= 6; x++) {
    for (const y of [-4, 4]) place(new THREE.BoxGeometry(0.94, 0.05, 0.92), stone, x, -0.075, y);
  }
  for (let y = -3; y <= 3; y++) {
    for (const x of [-6, 6]) place(new THREE.BoxGeometry(0.92, 0.05, 0.94), stone, x, -0.075, y);
  }
  const entry = map.route[0];
  for (const x of [entry.x - 0.65, entry.x + 0.65]) {
    place(new THREE.CylinderGeometry(0.13, 0.21, 1.2, 6), dark, x, 0.6, entry.y);
    place(new THREE.OctahedronGeometry(0.24), glass, x, 1.27, entry.y);
  }

  const pads = new Map<SiteId, THREE.Mesh>();
  const padGeometry = new THREE.CylinderGeometry(0.78, 0.92, 0.16, 8);
  const selectedPad = new THREE.MeshStandardMaterial({ color: "#ecaf5e", emissive: "#7c491a" });
  for (const site of Object.keys(map.buildSites) as SiteId[]) {
    const { x, y } = map.buildSites[site];
    const pad = place(padGeometry, dark, x, 0.03, y);
    pad.userData.pick = { site } satisfies Pick;
    pads.set(site, pad);
  }

  const towerMeshes = new Map<number, UnitModel>();
  const enemyMeshes = new Map<number, UnitModel>();
  const flashes = new Map<number, { mesh: THREE.Line; end: number }>();
  const rayMaterial = new THREE.LineBasicMaterial({ color: "#ffd883" });
  const raycaster = new THREE.Raycaster();
  let dirty = true;

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    const aspect = width / height;
    const halfHeight = Math.max(7, 9 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dirty = true;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2,
    ), camera);
    const objects = [...pads.values(), ...Array.from(towerMeshes.values(), tower => tower.body), ...Array.from(enemyMeshes.values(), enemy => enemy.body)];
    const hit = raycaster.intersectObjects(objects, true)[0];
    if (hit) {
      const pick = hit.object.userData.pick ?? hit.object.parent?.userData.pick;
      if (pick) select(pick);
    }
  });

  function sync(state: MatchState, site: SiteId) {
    for (const [id, mesh] of towerMeshes) {
      if (state.towers.some(tower => tower.id === id)) continue;
      scene.remove(mesh.body);
      towerMeshes.delete(id);
    }
    for (const tower of state.towers) {
      let model = towerMeshes.get(tower.id);
      if (!model) {
        model = models.get(tower.type)!();
        model.body.userData.pick = { site: tower.site } satisfies Pick;
        scene.add(model.body);
        towerMeshes.set(tower.id, model);
      }
      const { x, y } = map.buildSites[tower.site];
      model.body.position.set(x, 0, y);
      model.body.scale.setScalar(tower.level > 1 ? 1.24 : 1);
    }
    for (const [id, mesh] of enemyMeshes) {
      if (state.enemies.some(enemy => enemy.id === id)) continue;
      scene.remove(mesh.body);
      enemyMeshes.delete(id);
    }
    for (const enemy of state.enemies) {
      let mesh = enemyMeshes.get(enemy.id);
      if (!mesh) {
        mesh = models.get(enemy.type)!();
        mesh.body.userData.pick = { enemyId: enemy.id } satisfies Pick;
        scene.add(mesh.body);
        enemyMeshes.set(enemy.id, mesh);
      }
      mesh.body.position.set(enemy.position.x, 0, enemy.position.y);
      const waypoint = map.route[enemy.nextWaypoint];
      mesh.body.rotation.y = Math.atan2(waypoint.x - enemy.position.x, waypoint.y - enemy.position.y);
    }
    for (const [id, pad] of pads) pad.material = id === site ? selectedPad : dark;
    dirty = true;
  }

  function animate(hit: Hit, now: number) {
    const tower = towerMeshes.get(hit.towerId);
    if (!tower) return;
    tower.attack(now);
    const previous = flashes.get(hit.towerId);
    if (previous) {
      scene.remove(previous.mesh);
      previous.mesh.geometry.dispose();
    }
    const { x, z } = tower.body.position;
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 1.1, z), new THREE.Vector3(hit.x, 0.38, hit.y),
    ]), rayMaterial);
    scene.add(ray);
    flashes.set(hit.towerId, { mesh: ray, end: now + 220 });
  }

  function animateEnemy(id: number, now: number) {
    enemyMeshes.get(id)?.attack(now);
  }

  function draw(now: number) {
    for (const unit of towerMeshes.values()) dirty = unit.draw(now) || dirty;
    for (const unit of enemyMeshes.values()) dirty = unit.draw(now) || dirty;
    if (!dirty && !flashes.size) return;
    for (const [id, flash] of flashes) {
      if (now < flash.end) continue;
      scene.remove(flash.mesh);
      flash.mesh.geometry.dispose();
      flashes.delete(id);
    }
    renderer.render(scene, camera);
    dirty = false;
  }

  return { sync, animate, animateEnemy, draw };
}
