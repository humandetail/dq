import { appearanceChoice } from "./game/m2/appearance.ts";
import * as THREE from "three";
import { map, gridSize, type Point } from "./game/m2/map.ts";
import { heroModelScale } from "./game/m2/hero.ts";
import { weaponScheduleRate } from "./game/m2/combat.ts";
import { canSeeEnemy, diseasePulseTargets, inspectBuildPlacement, type Match, type Action } from "./game/m2/match.ts";

export type BuildSelection = { label: string; action: Omit<Extract<Action, { type: "build-card" }>, "point"> | Omit<Extract<Action, { type: "build-worker-tower" }>, "point"> };
import bindings from "./assets/m2/bindings.json" with { type: "json" };
import { loadM2Model, type ModelId } from "./m2-models.ts";
import { addM2Terrain } from "./m2-terrain.ts";

const scale = 1 / 100;
const toWorld = (value: number) => value * scale;

const auraColors: Readonly<Record<string, string>> = {
  S532: "#73e5a4", S533: "#ffcf90", S534: "#dca2ff", S535: "#ff624d",
  S536: "#ffc66e", S537: "#ecf4f4", S539: "#69b9fa", S540: "#9ceafe",
  S543: "#b6a2ff", S544: "#ff8f52", S546: "#f598bc", S548: "#9fe86f",
  S549: "#c5eaff", S553: "#ff91b4",
};

export type CameraView = { preset: "oblique" | "top" | "custom"; yaw: number; zoom: number };

export async function createM2Scene(canvas: HTMLCanvasElement, place: (point: Point) => void,
  previewChanged: (message: string) => void, viewChanged: (view: CameraView) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const models = new Map<ModelId, Awaited<ReturnType<typeof loadM2Model>>>();
  const requests = new Map<ModelId, Promise<void>>();
  const bindingById = bindings as Record<string, { asset: ModelId; size: number }>;
  function requestModel(id: ModelId) {
    if (!requests.has(id)) {
      requests.set(id, loadM2Model(id, renderer.getContext()).then(model => { models.set(id, model); }).catch(error => {
        console.error(error);
        canvas.dataset.assetError = String(error);
      }));
    }
    return requests.get(id)!;
  }
  await Promise.all((["H021", "H029", "H038", "H044", "n001", "n006", "n021", "m001"] as const).map(requestModel));
  void requestModel(bindingById.nsha.asset);
  function modelFor(unitId: string) {
    const binding = bindingById[unitId];
    if (!binding) return;
    const model = models.get(binding.asset);
    if (!model) { void requestModel(binding.asset); return; }
    return { model, size: binding.size };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#23373b");
  const overview = new THREE.OrthographicCamera();
  const tactical = new THREE.PerspectiveCamera(46, 1, .1, 200);
  let camera: THREE.OrthographicCamera | THREE.PerspectiveCamera = tactical;
  const focus = new THREE.Vector3(0, 0, -1.6);
  const offset = new THREE.Vector3();
  const defaultPitch = THREE.MathUtils.degToRad(45);
  const defaultZoom = 1.45;
  const defaultYaw = Math.PI;
  let zoom = defaultZoom;
  const cameraDistance = Math.hypot(28, 15);
  let yaw = defaultYaw;
  let pitch = defaultPitch;
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const size = new THREE.Vector2();
  const hit = new THREE.Vector3();
  scene.add(new THREE.HemisphereLight("#e3e1c1", "#555141", 1.65));
  const sun = new THREE.DirectionalLight("#fff0c9", 1.35);
  sun.position.set(-8, 14, -6);
  scene.add(sun);
  addM2Terrain(scene);

  function project() {
    const overhead = Math.abs(pitch - Math.PI / 2) < 1e-6;
    camera = overhead ? overview : tactical;
    camera.zoom = zoom;
    const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    offset.set(Math.sin(yaw) * cosPitch, sinPitch, Math.cos(yaw) * cosPitch).multiplyScalar(cameraDistance);
    // An explicit up vector keeps the exact overhead view stable at any heading.
    camera.up.set(-Math.sin(yaw) * sinPitch, cosPitch, -Math.cos(yaw) * sinPitch);
    camera.position.copy(focus).add(offset);
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    hover = pointer ? pointAt(pointer) : undefined;
    const preset = overhead ? "top" :
      Math.abs(pitch - defaultPitch) < 1e-6 ? "oblique" : "custom";
    const heading = (Math.round(THREE.MathUtils.radToDeg(yaw)) % 360 + 360) % 360;
    canvas.dataset.cameraYaw = String(heading);
    canvas.dataset.cameraPitch = String(THREE.MathUtils.radToDeg(pitch));
    canvas.dataset.cameraZoom = String(camera.zoom);
    canvas.dataset.cameraFocus = `${focus.x},${focus.z}`;
    canvas.dataset.cameraProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements.join(",");
    viewChanged({ preset, yaw: heading, zoom: camera.zoom });
  }

  const towerGeometry = new THREE.CylinderGeometry(.36, .7, .85, 8);
  const towerMaterial = new THREE.MeshStandardMaterial({ color: "#8fd4ac" });
  const constructionMaterial = new THREE.MeshStandardMaterial({ color: "#e5ab65", wireframe: true });
  const enemyGeometry = new THREE.IcosahedronGeometry(.14, 0);
  const enemyMaterial = new THREE.MeshStandardMaterial({ color: "#ed8666" });
  const meshes = new Map<number, THREE.Mesh>();
  const workerMarker = new THREE.Mesh(new THREE.RingGeometry(.16, .19, 24),
    new THREE.MeshBasicMaterial({ color: "#ffe17d" }));
  workerMarker.rotation.x = -Math.PI / 2;
  scene.add(workerMarker);
  const aura = new THREE.Group();
  const auraMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: .8, side: THREE.DoubleSide });
  for (const radius of [.32, .48]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - .027, radius, 24), auraMaterial);
    ring.rotation.x = -Math.PI / 2;
    aura.add(ring);
  }
  const sparks = new THREE.IcosahedronGeometry(.045, 0);
  const auraSparks = Array.from({ length: 6 }, (_, index) => {
    const mesh = new THREE.Mesh(sparks, auraMaterial);
    const angle = index * Math.PI / 3;
    mesh.position.set(Math.cos(angle) * .42, .08, Math.sin(angle) * .42);
    aura.add(mesh);
    return mesh;
  });
  scene.add(aura);
  const workerTitle = document.createElement("span");
  workerTitle.className = "worker-title";
  workerTitle.hidden = true;
  canvas.after(workerTitle);
  const projectedTitle = new THREE.Vector3();
  const combatGeometry = new THREE.BufferGeometry();
  const combatVertices = new Float32Array(512 * 3);
  const combatPositions = new THREE.BufferAttribute(combatVertices, 3).setUsage(THREE.DynamicDrawUsage);
  combatGeometry.setAttribute("position", combatPositions);
  const combatLines = new THREE.LineSegments(combatGeometry, new THREE.LineBasicMaterial({
    color: "#ffe095", depthTest: false,
  }));
  combatLines.frustumCulled = false;
  scene.add(combatLines);
  let matchId: string | undefined;
  let drag: { clientX: number; clientY: number; rotate: boolean } | undefined;
  let pointer: { clientX: number; clientY: number } | undefined;

  let hover: Point | undefined;
  let selection: BuildSelection | undefined;
  let selectedWolf: number | undefined;
  let choosingPoint = false;
  let current: Match | undefined;
  const knownTowers = new Map<number, Point & { templateId: string; modelScale: number }>();
  const towerExits: (Point & { id: number; templateId: string; modelScale: number; atUs: number })[] = [];
  const buildLines = new THREE.Group();
  const gridLines = new THREE.Group();
  scene.add(buildLines, gridLines);
  const boundaryMaterial = new THREE.LineBasicMaterial({ color: "#dfd39b", transparent: true, opacity: .8 });
  const gridMaterial = new THREE.LineBasicMaterial({ color: "#c2df91", transparent: true, opacity: .24 });
  for (const area of map.buildAreas) {
    const outline = [[area.minX, area.minY], [area.maxX, area.minY], [area.maxX, area.maxY], [area.minX, area.maxY]];
    buildLines.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline.map(([x, y]) =>
      new THREE.Vector3(toWorld(x), .04, toWorld(y)))), boundaryMaterial));
    const lines: THREE.Vector3[] = [];
    for (let x = area.minX; x <= area.maxX; x += gridSize) {
      lines.push(new THREE.Vector3(toWorld(x), .035, toWorld(area.minY)), new THREE.Vector3(toWorld(x), .035, toWorld(area.maxY)));
    }
    for (let y = area.minY; y <= area.maxY; y += gridSize) {
      lines.push(new THREE.Vector3(toWorld(area.minX), .035, toWorld(y)), new THREE.Vector3(toWorld(area.maxX), .035, toWorld(y)));
    }
    gridLines.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), gridMaterial));
  }
  const previewMaterial = new THREE.MeshBasicMaterial({ color: "#9ceaa0", transparent: true, opacity: .5, depthWrite: false });
  const footprint = new THREE.Mesh(new THREE.RingGeometry(.68, .74, 48), previewMaterial);
  footprint.rotation.x = -Math.PI / 2;
  const ghost = new THREE.Mesh(towerGeometry, new THREE.MeshBasicMaterial({ color: "#9ceaa0", wireframe: true, transparent: true, opacity: .75 }));
  const preview = new THREE.Group();
  ghost.position.y = .43;
  preview.add(footprint, ghost);
  preview.visible = false;
  scene.add(preview);

  function pointAt(event: Pick<MouseEvent, "clientX" | "clientY">) {
    const box = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1,
      1 - (event.clientY - box.top) / box.height * 2), camera);
    return ray.ray.intersectPlane(ground, hit) ? { x: hit.x / scale, y: hit.z / scale } : undefined;
  }

  canvas.addEventListener("pointerdown", event => {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      drag = { clientX: event.clientX, clientY: event.clientY, rotate: event.button === 1 || event.shiftKey };
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener("pointermove", event => {
    pointer = { clientX: event.clientX, clientY: event.clientY };
    if (drag) {
      if (drag.rotate) {
        yaw += (event.clientX - drag.clientX) * .006;
        pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.clientY) * .004, Math.PI / 6, Math.PI / 2);
      } else {
        // Pan in the ground plane under the current camera, including after rotation.
        const previous = pointAt(drag), next = pointAt(event);
        if (previous && next) {
          focus.x = THREE.MathUtils.clamp(focus.x + (previous.x - next.x) * scale, toWorld(map.bounds.minX), toWorld(map.bounds.maxX));
          focus.z = THREE.MathUtils.clamp(focus.z + (previous.y - next.y) * scale, toWorld(map.bounds.minY), toWorld(map.bounds.maxY));
        }
      }
      drag = { ...drag, ...pointer };
      project();
    }
    hover = pointAt(event);
  });
  const endDrag = () => { drag = undefined; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);
  canvas.addEventListener("contextmenu", event => event.preventDefault());
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    pointer = { clientX: event.clientX, clientY: event.clientY };
    zoomView(Math.exp(-event.deltaY * .001));
  }, { passive: false });

  canvas.addEventListener("pointerleave", () => { pointer = undefined; hover = undefined; });
  canvas.addEventListener("click", event => {
    if (event.button !== 0) return;
    const point = pointAt(event);
    if ((selection || selectedWolf !== undefined || choosingPoint) && current && point) place(point);
  });

  function setView(preset: "oblique" | "top") {
    if (preset === "oblique") { resetView(); return; }
    pitch = Math.PI / 2;
    focus.set(0, 0, 0);
    zoom = 1;
    project();
  }
  function rotateView(direction: -1 | 1) {
    yaw += direction * Math.PI / 4;
    project();
  }
  function zoomView(factor: number) {
    zoom = THREE.MathUtils.clamp(zoom * factor, .55, 2.5);
    project();
  }
  function resetView() {
    focus.set(0, 0, -1.6);
    zoom = defaultZoom;
    yaw = defaultYaw;
    pitch = defaultPitch;
    project();
  }
  project();
  const render = (state: Match | undefined, build?: BuildSelection, wolfId?: number, pointPrompt?: string) => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    renderer.getSize(size);
    if (size.x !== width || size.y !== height) {
      const halfHeight = Math.max(14.8, 16.5 * height / Math.max(1, width));
      const halfWidth = halfHeight * width / Math.max(1, height);
      Object.assign(overview, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight });
      tactical.aspect = width / Math.max(1, height);
      project();
      renderer.setSize(width, height, false);
    }

    current = state;
    selection = build;
    selectedWolf = wolfId;
    choosingPoint = !!pointPrompt;
    gridLines.visible = !!build;
    boundaryMaterial.opacity = build ? 1 : .65;
    canvas.style.cursor = build || wolfId !== undefined || pointPrompt ? "crosshair" : "grab";
    preview.visible = !!build && !!state && !!hover;
    let message = build ? `正在放置 ${build.label} · 将鼠标移到浅绿建造区` : "先选择右侧的塔卡或工人塔，再点击金色边界内的浅绿建造区。";
    if (build && state && hover) {
      const result = inspectBuildPlacement(state, { ...build.action, point: hover });
      const point = result.ok ? result.disk : { x: Math.round(hover.x / gridSize) * gridSize, y: Math.round(hover.y / gridSize) * gridSize };
      const color = result.ok ? "#9ceaa0" : "#ff7970";
      previewMaterial.color.set(color);
      ghost.material.color.set(color);
      preview.position.set(toWorld(point.x), .06, toWorld(point.y));
      canvas.dataset.placement = result.ok ? "valid" : "invalid";
      message = result.ok ? `${build.label} · 可放置，左键确认；工人会自动接近施工` :
        result.reason === "resources" ? "金币、木材或人口不足 · 换一座塔或补足资源" :
        result.reason === "missing" ? "塔卡已不可用，请重新选择" : "此处不可放置 · 避开道路、障碍及已有塔，并留出完整底座空间";
    } else if (pointPrompt) {
      canvas.dataset.placement = "spell-point";
      message = pointPrompt;
    } else if (wolfId !== undefined) {
      canvas.dataset.placement = "wolf";
      message = `灵兽 #${wolfId} · 左键选取地面目的地，Esc 取消`;
    } else canvas.dataset.placement = build ? "selecting" : "idle";
    previewChanged(message);

    if (matchId !== state?.matchId) {
      for (const mesh of meshes.values()) scene.remove(mesh);
      meshes.clear();
      knownTowers.clear();
      towerExits.length = 0;
      matchId = state?.matchId;
    }
    const visible = new Set<number>();
    function update(id: number, point: Point, y: number, geometry: THREE.BufferGeometry, material: THREE.Material) {
      visible.add(id);
      let mesh = meshes.get(id);
      if (!mesh) {
        mesh = new THREE.Mesh(geometry, material);
        meshes.set(id, mesh);
        scene.add(mesh);
      }
      mesh.material = material;
      mesh.position.set(toWorld(point.x), y, toWorld(point.y));
      return mesh;
    }
    for (const tower of state?.structures ?? []) {
      if (!modelFor(tower.templateId) || tower.pending && !tower.pending.upgradeTo) {
        update(tower.id, tower, .43, towerGeometry, tower.pending ? constructionMaterial : towerMaterial);
      }
    }
    for (const enemy of state?.enemies ?? []) {
      if (!state || !canSeeEnemy(state, enemy) || state.queue.nowUs < (enemy.phaseUntilUs ?? 0)) continue;
      if (!modelFor(enemy.unitId)) {
        const mesh = update(enemy.id, enemy, .21, enemyGeometry, enemyMaterial);
        mesh.scale.setScalar(enemy.unitId === "mBOS" ? 3.5 : 1);
      }
    }
    for (const [id, mesh] of meshes) {
      if (visible.has(id)) continue;
      scene.remove(mesh);
      meshes.delete(id);
    }
    workerMarker.visible = state !== undefined;
    if (state) workerMarker.position.set(toWorld(state.worker.x), .045, toWorld(state.worker.y));
    let vertex = 0;
    let shots = 0;
    const projectileSources = new Set<string>();
    let hits = 0;
    let rainArrows = 0;
    let rainImpacts = 0;
    let artilleryImpacts = 0;
    function line(x1: number, y1: number, h1: number, x2: number, y2: number, h2: number) {
      if (vertex + 2 > combatPositions.count) return;
      combatPositions.setXYZ(vertex++, toWorld(x1), h1, toWorld(y1));
      combatPositions.setXYZ(vertex++, toWorld(x2), h2, toWorld(y2));
    }
    if (state) {
      for (const { dueUs, payload } of state.queue.pending) {
        if (payload.type === "weapon-impact" && vertex + 2 <= combatPositions.count) {
          const { shot, travelUs } = payload;
          const dx = shot.destination.x - shot.point.x, dy = shot.destination.y - shot.point.y;
          const distance = Math.hypot(dx, dy);
          if (!distance || shot.weapon.speed <= 0 || travelUs <= 0) continue;
          const elapsedUs = travelUs - (dueUs - state.queue.nowUs);
          const head = Math.min(distance, shot.weapon.speed * elapsedUs / 1_000_000);
          if (head <= 0) continue;
          const tail = Math.max(0, head - 55);
          const height = (progress: number) => shot.weapon.kind === "artillery" ?
            .24 + 1.2 * toWorld(distance) * progress * (1 - progress) : .7;
          line(shot.point.x + dx * tail / distance, shot.point.y + dy * tail / distance, height(tail / distance),
            shot.point.x + dx * head / distance, shot.point.y + dy * head / distance, height(head / distance));
          shots++;
          projectileSources.add(shot.sourceTemplate);
          continue;
        }
        if (payload.type !== "sword-rain-travel" || vertex + 2 > combatPositions.count) continue;
        const { origin, direction, distance, from } = payload;
        const head = Math.max(from, distance - 700 * Math.max(0, dueUs - state.queue.nowUs) / 1_000_000);
        const tail = Math.max(0, head - 55);
        line(origin.x + direction.x * tail, origin.y + direction.y * tail, .7,
          origin.x + direction.x * head, origin.y + direction.y * head, .35);
        rainArrows++;
      }
      for (const impact of state.swordRainImpacts ?? []) {
        const age = state.queue.nowUs - impact.atUs;
        if (age < 0 || age >= 300_000 || vertex + 16 > combatPositions.count) continue;
        const radius = 100 * Math.min(1, .35 + age / 160_000);
        for (let segment = 0; segment < 8; segment++) {
          const angle = segment * Math.PI / 4, next = angle + Math.PI / 4;
          line(impact.x + radius * Math.cos(angle), impact.y + radius * Math.sin(angle), .24,
            impact.x + radius * Math.cos(next), impact.y + radius * Math.sin(next), .24);
        }
        rainImpacts++;
      }
      for (const hit of state.recentHits ?? []) {
        const age = (state.queue.nowUs - hit.atUs) / state.clock.speed;
        if (age < 0 || age >= 300_000) continue;
        const radius = 12 + age / 9000;
        line(hit.x - radius, hit.y, .7, hit.x + radius, hit.y, .7);
        line(hit.x, hit.y - radius, .72, hit.x, hit.y + radius, .72);
        line(hit.x, hit.y, .4, hit.x, hit.y, 1.28);
        hits++;
      }
    }
    for (const effect of state?.battleAnimations ?? []) {
      const age = state!.queue.nowUs - effect.atUs;
      if (effect.kind === "heal-link" && effect.target && age >= 0 && age < 500_000) {
        line(effect.x, effect.y, .9, effect.target.x, effect.target.y, .9);
      }
      if ((effect.kind === "spell-link" || effect.kind === "weapon-link") && effect.target && age >= 0 &&
          age < (effect.kind === "spell-link" ? 700_000 : 250_000)) {
        const { x, y, target } = effect;
        const dx = target.x - x, dy = target.y - y;
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const offset = Math.min(24, length * .12);
          const first = { x: x + dx / 3 - offset * dy / length, y: y + dy / 3 + offset * dx / length };
          const second = { x: x + 2 * dx / 3 + offset * dy / length, y: y + 2 * dy / 3 - offset * dx / length };
          line(x, y, .75, first.x, first.y, .95);
          line(first.x, first.y, .95, second.x, second.y, .67);
          line(second.x, second.y, .67, target.x, target.y, .5);
        }
      }
      const artillery = effect.kind === "artillery-impact";
      if (!artillery && effect.kind !== "revive" || age < 0 || age >= (artillery ? 240_000 : 600_000)) continue;
      if (artillery) artilleryImpacts++;
      const radius = artillery ? 28 + age / 1700 : 30 + age / 3000;
      for (let index = 0; index < 8; index++) {
        const a = index * Math.PI / 4;
        const b = a + Math.PI / 4;
        line(effect.x + Math.cos(a) * radius, effect.y + Math.sin(a) * radius, .23,
          effect.x + Math.cos(b) * radius, effect.y + Math.sin(b) * radius, .23);
      }
    }
    if (state) for (const enemy of state.enemies) {
      if (!canSeeEnemy(state, enemy)) continue;
      for (const unit of diseasePulseTargets(state, enemy)) {
        line(unit.x - 28, unit.y, .25, unit.x, unit.y - 28, .25);
        line(unit.x, unit.y - 28, .25, unit.x + 28, unit.y, .25);
        line(unit.x + 28, unit.y, .25, unit.x, unit.y + 28, .25);
        line(unit.x, unit.y + 28, .25, unit.x - 28, unit.y, .25);
      }
      if (state.queue.nowUs < (enemy.graveUntilUs ?? 0)) {
        const radius = 38 + 6 * Math.ceil((enemy.graveUntilUs! - state.queue.nowUs) / 1_000_000);
        for (let index = 0; index < 8; index++) {
          const a = index * Math.PI / 4, b = a + Math.PI / 4;
          line(enemy.x + Math.cos(a) * radius, enemy.y + Math.sin(a) * radius, .26,
            enemy.x + Math.cos(b) * radius, enemy.y + Math.sin(b) * radius, .26);
        }
      }
    }
    combatGeometry.setDrawRange(0, vertex);
    if (vertex) combatPositions.needsUpdate = true;
    canvas.dataset.visibleShots = String(shots);
    canvas.dataset.projectileSources = [...projectileSources].join(",");
    canvas.dataset.visibleHits = String(hits);
    canvas.dataset.swordRainArrows = String(rainArrows);
    canvas.dataset.swordRainImpacts = String(rainImpacts);
    canvas.dataset.artilleryImpacts = String(artilleryImpacts);
    const auraId = state?.appearance?.aura;
    const color = auraId ? auraColors[auraId] : undefined;
    aura.visible = !!state && !!color;
    if (state && color) {
      aura.position.set(toWorld(state.worker.x), .068, toWorld(state.worker.y));
      aura.rotation.y = state.queue.nowUs / 1_500_000;
      auraMaterial.color.set(color);
      auraSparks.forEach((spark, index) => { spark.position.y = .12 + .1 * Math.sin(state.queue.nowUs / 290_000 + index); });
    }
    canvas.dataset.workerAura = aura.visible ? auraId! : "";
    const title = appearanceChoice("title", state?.appearance?.title);
    workerTitle.hidden = !title || !state;
    if (title && state) {
      projectedTitle.set(toWorld(state.worker.x), 2.1, toWorld(state.worker.y)).project(camera);
      workerTitle.textContent = title.name.replace("（工人）", "");
      workerTitle.style.left = `${canvas.offsetLeft + (projectedTitle.x + 1) * width / 2}px`;
      workerTitle.style.top = `${canvas.offsetTop + (1 - projectedTitle.y) * height / 2}px`;
    }
    renderer.resetState();
    renderer.render(scene, camera);
    if (!state) return;
    const elapsed = state.queue.nowUs / 1000;
    const workerId = appearanceChoice("worker", state.appearance?.worker)?.unitId ?? "w001";
    const workerVisual = modelFor(workerId);
    if (workerVisual) {
      const next = state.approach?.path[0];
      const clip = next ? "Walk" : "Stand";
      const facing = next ? Math.atan2(state.worker.y - next.y, next.x - state.worker.x) : .6;
      const action = workerVisual.model(camera, toWorld(state.worker.x), toWorld(state.worker.y), facing, elapsed, clip, workerVisual.size);
      canvas.dataset.workerModel = workerId;
      canvas.dataset.workerModelClip = clip;
      canvas.dataset.workerModelFrame = String(action.frame);
      const attachments = [
        [state.appearance?.wings, .54],
        [state.appearance?.accent, state.appearance?.accent === "S900" ? .1 : .52],
      ] as const;
      const rendered = [];
      for (const [id, height] of attachments) {
        const visual = id ? modelFor(id) : undefined;
        if (!id || !visual) continue;
        visual.model(camera, toWorld(state.worker.x), toWorld(state.worker.y), facing, elapsed, "Stand", visual.size, height);
        rendered.push(id);
      }
      canvas.dataset.workerAttachments = rendered.join(",");
    }
    const circleId = appearanceChoice("circle", state.appearance?.circle)?.unitId;
    const circleVisual = circleId ? modelFor(circleId) : undefined;
    canvas.dataset.circleModel = circleVisual ? circleId! : "";
    if (circleVisual) {
      circleVisual.model(camera, toWorld(map.energyCircle.x), toWorld(map.energyCircle.y), 0, elapsed, "Stand", circleVisual.size);
    }
    for (const detector of state.detectors ?? []) {
      if (detector.templateId !== "b116") continue;
      const visual = modelFor(detector.templateId);
      visual?.model(camera, toWorld(detector.x), toWorld(detector.y), 0, elapsed, "Stand", visual.size);
    }
    const renderedTowers = [];
    const walkingWolves = [];
    const renderedDemonflame = [];
    const substituteActions = [];
    delete canvas.dataset.growthModelSize;
    const standingTowers = new Set(state.structures.map(tower => tower.id));
    for (const [id, last] of knownTowers) {
      if (standingTowers.has(id)) continue;
      knownTowers.delete(id);
      towerExits.push({ id, ...last, atUs: state.queue.nowUs });
    }
    for (const tower of state.structures) {
      if (tower.pending && !tower.pending.upgradeTo) continue;
      knownTowers.set(tower.id, { templateId: tower.templateId, x: tower.x, y: tower.y,
        modelScale: heroModelScale(tower.hero, tower.templateId) });
    }
    for (const tower of [...state.structures, ...(state.summons ?? [])]) {
      const visuals = modelFor(tower.templateId);
      if (!visuals || tower.pending && !tower.pending.upgradeTo) continue;
      const attackTime = tower.lastAttackUs === undefined ? Infinity : elapsed - tower.lastAttackUs / 1000;
      const castTime = tower.lastCastUs === undefined ? Infinity : elapsed - tower.lastCastUs / 1000;
      const channeling = (tower.snow !== undefined || tower.leashToken !== undefined || tower.swordRainToken !== undefined) &&
        state.queue.nowUs < (tower.heroCastUntilUs ?? 0);
      const casting = castTime >= 0 && (channeling || castTime < 450 && castTime <= attackTime);
      const walking = tower.walkDirection !== undefined;
      const timing = tower.attack?.timing;
      const phase = timing?.windup ?? timing?.backswing;
      const attacking = !walking && (timing ? phase !== undefined : attackTime >= 0 && attackTime < 500);
      let attackFrame = attackTime;
      if (timing && phase) {
        const windup = phase === timing.windup;
        const phaseWork = windup ? timing.pointUs : timing.recoveryUs;
        const remaining = Math.max(0, phase.workUs - (state.queue.nowUs - phase.recordedUs) * weaponScheduleRate(timing.rawRate));
        attackFrame = ((windup ? 0 : timing.pointUs) + phaseWork - remaining) / 1000;
      }
      const target = casting ? tower.lastCastTarget : tower.lastAttackTarget;
      const facing = tower.walkDirection ? Math.atan2(-tower.walkDirection.y, tower.walkDirection.x) :
        target ? Math.atan2(tower.y - target.y, target.x - tower.x) : .6;
      const size = visuals.size * heroModelScale(tower.hero, tower.templateId);
      const action = visuals.model(camera, toWorld(tower.x), toWorld(tower.y), facing,
        casting ? channeling ? castTime % 450 : castTime : attacking ? attackFrame : elapsed,
        casting ? "Spell" : walking ? "Walk" : attacking ? "Attack" : "Stand", size);
      if (tower.demonflameTimer !== undefined) {
        const flames = modelFor("B165");
        if (flames) {
          flames.model(camera, toWorld(tower.x), toWorld(tower.y), facing, elapsed, "Stand", flames.size);
          renderedDemonflame.push(tower.id);
        }
      }
      if (tower.hero?.growthBonus) canvas.dataset.growthModelSize = String(size);
      renderedTowers.push(tower.templateId);
      if (walking) walkingWolves.push(tower.id);
      if (action.substitute) substituteActions.push(`${tower.templateId}:${action.substitute}:${action.progress}`);
      if (tower.templateId === "H021") {
        canvas.dataset.towerModelClip = casting ? "Spell" : attacking ? "Attack" : "Stand";
        canvas.dataset.towerModelFrame = String(action.frame);
      }
    }
    for (let index = towerExits.length - 1; index >= 0; index--) {
      const exit = towerExits[index];
      const age = elapsed - exit.atUs / 1000;
      if (age >= 720) {
        towerExits.splice(index, 1);
        continue;
      }
      const visuals = modelFor(exit.templateId);
      const action = visuals?.model(camera, toWorld(exit.x), toWorld(exit.y), 0, age, "Death", visuals.size * exit.modelScale);
      if (action?.substitute) substituteActions.push(`${exit.templateId}:${action.substitute}:${action.progress}`);
    }
    canvas.dataset.renderedTowers = renderedTowers.join(",");
    canvas.dataset.walkingWolves = walkingWolves.join(",");
    canvas.dataset.renderedDemonflame = renderedDemonflame.join(",");
    canvas.dataset.towerActionSubstitutes = substituteActions.join(",");
    const renderedEnemies = new Set<string>();
    const castingEnemies = new Set<string>();
    for (const enemy of state.enemies) {
      if (!canSeeEnemy(state, enemy) || state.queue.nowUs < (enemy.phaseUntilUs ?? 0)) continue;
      const hexed = enemy.hexSourceId !== undefined || state.queue.nowUs < (enemy.hexUntilUs ?? 0);
      const visuals = (hexed ? modelFor("nsha") : undefined) ?? modelFor(enemy.unitId);
      if (!visuals) continue;
      const target = enemy.path?.[0] ?? map.waypoints[enemy.waypoint];
      const facing = Math.atan2(enemy.y - target.y, target.x - enemy.x);
      const stopped = state.queue.nowUs < Math.max(enemy.stunUntilUs ?? 0, enemy.doomUntilUs ?? 0) || !!enemy.leashes?.length;
      const castAge = state.queue.nowUs - Math.max(enemy.graveCastUs ?? -Infinity, enemy.lastSpellUs ?? -Infinity);
      const casting = !hexed && !stopped && castAge < 500_000;
      const clip = casting ? "Spell" : stopped || enemy.welfare ? "Stand" : "Walk";
      const lift = enemy.welfare ? .07 + .055 * Math.sin((elapsed + enemy.id * 87) / 120) : 0;
      const action = visuals.model(camera, toWorld(enemy.x), toWorld(enemy.y), facing,
        casting ? castAge / 1000 : elapsed + enemy.id * 87, clip, visuals.size, lift);
      if (enemy.unitId === "m001") canvas.dataset.enemyModelFrame = String(action.frame);
      renderedEnemies.add(enemy.unitId);
      if (casting) castingEnemies.add(enemy.unitId);
    }
    const animations = state.battleAnimations ?? (state.recentHits ?? []).flatMap(hit =>
      hit.deadUnitId ? [{ ...hit, unitId: hit.deadUnitId, kind: "death" as const }] : []);
    const renderedDeaths = [];
    const renderedRevives = [];
    for (const effect of animations) {
      const age = elapsed - effect.atUs / 1000;
      if (age < 0 || age > 720) continue;
      if (effect.kind === "revive" && age < 600) renderedRevives.push(effect.unitId);
      if (effect.kind !== "death") continue;
      const visuals = modelFor(effect.unitId);
      if (!visuals) continue;
      visuals.model(camera, toWorld(effect.x), toWorld(effect.y), 0, age, "Death", visuals.size);
      renderedDeaths.push(effect.unitId);
    }
    canvas.dataset.battleDeaths = renderedDeaths.join(",");
    canvas.dataset.battleRevives = renderedRevives.join(",");
    canvas.dataset.renderedEnemies = [...renderedEnemies].join(",");
    canvas.dataset.castingEnemies = [...castingEnemies].join(",");
  };
  return Object.assign(render, { resetView, setView, rotateView, zoomView });
}
