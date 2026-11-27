import { appearanceChoice } from "./game/m2/appearance.ts";
import * as THREE from "three";
import { map, gridSize, terrain, type Point } from "./game/m2/map.ts";
import { heroModelScale } from "./game/m2/hero.ts";
import { weapons, weaponScheduleRate } from "./game/m2/combat.ts";
import { canSeeEnemy, diseasePulseTargets, inspectBuildPlacement, troopAuraAffects, troopAuraInRange, troopAuraSkill, type Match, type Action } from "./game/m2/match.ts";

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
  const coreModels = Promise.all((["H021", "H029", "H038", "H044", "n001", "n006", "n021", "m001"] as const).map(requestModel));
  void requestModel(bindingById.nsha.asset);
  async function preloadMatch(state: Match) {
    const unitIds = new Set([
      appearanceChoice("worker", state.appearance?.worker)?.unitId ?? "w001",
      appearanceChoice("circle", state.appearance?.circle)?.unitId,
      state.appearance?.wings,
      state.appearance?.accent,
    ]);
    for (const tower of state.structures) unitIds.add(tower.templateId);
    for (const summon of state.summons ?? []) unitIds.add(summon.templateId);
    for (const detector of state.detectors ?? []) unitIds.add(detector.templateId);
    for (const enemy of state.enemies) {
      unitIds.add(enemy.unitId);
      if (enemy.hexForm) unitIds.add(enemy.hexForm);
    }
    for (const effect of state.battleAnimations ?? []) unitIds.add(effect.unitId);
    const assets = new Set<ModelId>();
    for (const id of unitIds) {
      const asset = id && bindingById[id]?.asset;
      if (asset) assets.add(asset);
    }
    await Promise.all([...assets].map(requestModel));
    canvas.dataset.activeAssets = String([...assets].filter(id => models.has(id)).length);
  }
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
  const defaultFocus = terrain
    ? new THREE.Vector3(toWorld((map.worker.x + map.entry.x) / 2), 0, toWorld((map.worker.y + map.entry.y) / 2))
    : new THREE.Vector3(0, 0, -1.6);
  const focus = defaultFocus.clone();
  const offset = new THREE.Vector3();
  const defaultPitch = THREE.MathUtils.degToRad(45);
  const defaultZoom = 1.45;
  const minPitch = THREE.MathUtils.degToRad(18);
  const defaultYaw = Math.PI;
  let zoom = defaultZoom;
  const cameraDistance = Math.hypot(28, 15);
  let yaw = defaultYaw;
  let pitch = defaultPitch;
  let orbit = false;
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const size = new THREE.Vector2();
  const hit = new THREE.Vector3();
  scene.add(new THREE.HemisphereLight("#e3e1c1", "#555141", 1.65));
  const sun = new THREE.DirectionalLight("#fff0c9", 1.35);
  sun.position.set(-8, 14, -6);
  scene.add(sun);
  const [surface] = await Promise.all([addM2Terrain(scene), coreModels]);
  canvas.dataset.terrainGrid = `${surface.cellsX}x${surface.cellsY}`;
  canvas.dataset.terrainDoodads = `${surface.trees}+${surface.plants}`;

  function project() {
    const overhead = Math.abs(pitch - Math.PI / 2) < 1e-6;
    camera = overhead ? overview : tactical;
    camera.zoom = overhead ? zoom : zoom * Math.min(1, tactical.aspect / 1.15);
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
    canvas.dataset.cameraZoom = String(zoom);
    canvas.dataset.cameraFocus = `${focus.x},${focus.z}`;
    canvas.dataset.cameraProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements.join(",");
    viewChanged({ preset, yaw: heading, zoom });
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
  const fingerDisplays = new Map<number, HTMLSpanElement>();
  const projectedPoint = new THREE.Vector3();
  const combatGeometry = new THREE.BufferGeometry();
  const combatVertices = new Float32Array(512 * 3);
  const combatPositions = new THREE.BufferAttribute(combatVertices, 3).setUsage(THREE.DynamicDrawUsage);
  combatGeometry.setAttribute("position", combatPositions);
  const combatLines = new THREE.LineSegments(combatGeometry, new THREE.LineBasicMaterial({
    color: "#ffe095", depthTest: false,
  }));
  combatLines.frustumCulled = false;
  scene.add(combatLines);
  const rangePoints = Array.from({ length: 96 }, (_, i) => {
    const angle = i * 2 * Math.PI / 96;
    return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  });
  const rangeRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rangePoints),
    new THREE.LineBasicMaterial({ color: "#f6d88e", transparent: true, opacity: .8, depthTest: false }));
  rangeRing.visible = false;
  scene.add(rangeRing);
  let matchId: string | undefined;
  let drag: { id: number; clientX: number; clientY: number; rotate: boolean; pendingTouch: boolean } | undefined;
  const touches = new Map<number, { clientX: number; clientY: number }>();
  let suppressTouchClick = false;
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
  for (const area of terrain ? [] : map.buildAreas) {
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
    const touch = event.pointerType === "touch";
    if (touch) {
      touches.set(event.pointerId, event);
      canvas.setPointerCapture(event.pointerId);
      if (touches.size > 1) {
        suppressTouchClick = true;
        return;
      }
      suppressTouchClick = false;
    } else {
      if (event.button !== 1 && !(orbit && event.button === 0)) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
    }
    drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      rotate: !touch && (event.button === 0 || event.shiftKey), pendingTouch: touch };
  });
  canvas.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") {
      if (!touches.has(event.pointerId)) return;
      const [beforeA, beforeB] = touches.values();
      touches.set(event.pointerId, event);
      if (beforeB) {
        const [a, b] = touches.values();
        const oldX = beforeB.clientX - beforeA.clientX, oldY = beforeB.clientY - beforeA.clientY;
        const x = b.clientX - a.clientX, y = b.clientY - a.clientY;
        yaw += Math.atan2(y, x) - Math.atan2(oldY, oldX);
        zoomView(Math.hypot(x, y) / Math.max(1, Math.hypot(oldX, oldY)));
        return;
      }
    }
    pointer = { clientX: event.clientX, clientY: event.clientY };
    if (drag?.id === event.pointerId) {
      if (drag.pendingTouch && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 8) return;
      if (drag.rotate) {
        yaw += (event.clientX - drag.clientX) * .006;
        pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.clientY) * .006, minPitch, Math.PI / 2);
      } else {
        // Pan in the ground plane under the current camera, including after rotation.
        const previous = pointAt(drag), next = pointAt(event);
        if (previous && next) {
          focus.x = THREE.MathUtils.clamp(focus.x + (previous.x - next.x) * scale, toWorld(map.bounds.minX), toWorld(map.bounds.maxX));
          focus.z = THREE.MathUtils.clamp(focus.z + (previous.y - next.y) * scale, toWorld(map.bounds.minY), toWorld(map.bounds.maxY));
        }
      }
      drag = { ...drag, ...pointer, pendingTouch: false };
      project();
    }
    hover = pointAt(event);
  });
  const endDrag = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      if (!touches.delete(event.pointerId)) return;
      if (drag?.id === event.pointerId && !drag.pendingTouch) suppressTouchClick = true;
      const next = touches.entries().next().value;
      drag = next ? { id: next[0], clientX: next[1].clientX, clientY: next[1].clientY,
        rotate: false, pendingTouch: false } : undefined;
      pointer = undefined;
      hover = undefined;
    } else if (drag?.id === event.pointerId) {
      drag = undefined;
    }
  };
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
  // Stop a pan's click before it can reach either the scene or the command UI.
  canvas.parentElement!.addEventListener("click", event => {
    if (event.target === canvas && event instanceof PointerEvent &&
        (event.pointerType === "touch" ? suppressTouchClick : orbit))
      event.stopPropagation();
  }, true);
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
    zoom = THREE.MathUtils.clamp(zoom * factor, .4, 4);
    project();
  }
  function resetView() {
    focus.copy(defaultFocus);
    zoom = defaultZoom;
    yaw = defaultYaw;
    pitch = defaultPitch;
    project();
  }
  project();
  const render = (state: Match | undefined, build?: BuildSelection, wolfId?: number, pointPrompt?: string) => {
    const { clientWidth: width, clientHeight: height, offsetLeft: canvasLeft, offsetTop: canvasTop } = canvas;
    renderer.getSize(size);
    if (size.x !== width || size.y !== height) {
      const halfHeight = terrain ? Math.max(
        toWorld((map.bounds.maxY - map.bounds.minY) / 2 + 160),
        toWorld((map.bounds.maxX - map.bounds.minX) / 2 + 160) * height / Math.max(1, width),
      ) : Math.max(14.8, 16.5 * height / Math.max(1, width));
      const halfWidth = halfHeight * width / Math.max(1, height);
      Object.assign(overview, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight });
      tactical.aspect = width / Math.max(1, height);
      project();
      renderer.setSize(width, height, false);
      size.set(width, height);
    }

    current = state;
    selection = build;
    selectedWolf = wolfId;
    choosingPoint = !!pointPrompt;
    gridLines.visible = !!build;
    boundaryMaterial.opacity = build ? 1 : .65;
    canvas.style.cursor = orbit ? "move" : build || wolfId !== undefined || pointPrompt ? "crosshair" : "grab";
    preview.visible = !!build && !!state && !!hover;
    let message = build ? `正在放置 ${build.label} · 选择浅绿建造区` : "选择工人建造或塔卡，再点击浅绿建造区。";
    if (build && state && hover) {
      const result = inspectBuildPlacement(state, { ...build.action, point: hover });
      const point = result.ok ? result.disk : { x: Math.round(hover.x / gridSize) * gridSize, y: Math.round(hover.y / gridSize) * gridSize };
      const color = result.ok ? "#9ceaa0" : "#ff7970";
      previewMaterial.color.set(color);
      ghost.material.color.set(color);
      preview.position.set(toWorld(point.x), .06, toWorld(point.y));
      canvas.dataset.placement = result.ok ? "valid" : "invalid";
      message = result.ok ? `${build.label} · 可放置，点击确认；工人会自动接近施工` :
        result.reason === "resources" ? "金币、木材或人口不足 · 换一座塔或补足资源" :
        result.reason === "missing" ? "塔卡已不可用，请重新选择" : "此处不可放置 · 避开道路、障碍及已有塔，并留出完整底座空间";
    } else if (pointPrompt) {
      canvas.dataset.placement = "spell-point";
      message = pointPrompt;
    } else if (wolfId !== undefined) {
      canvas.dataset.placement = "wolf";
      message = `灵兽 #${wolfId} · 选择地面目的地`;
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
    if (state) for (const tower of state.structures) {
      if (tower.wispLink) {
        const target = state.structures.find(unit => unit.id === tower.wispLink?.targetId) ??
          state.summons?.find(unit => unit.id === tower.wispLink?.targetId);
        if (target) line(tower.x, tower.y, .9, target.x, target.y, .9);
      }
      const drain = state.lifeDrains?.[tower.id];
      if (drain) {
        const target = state.enemies.find(unit => unit.id === drain.targetId);
        if (target) {
          line(tower.x, tower.y, drain.skillId === "A176" ? 1.1 : .8, target.x, target.y, .75);
          if (drain.carrier?.active) line(drain.carrier.x, drain.carrier.y, .4, target.x, target.y, .5);
        }
      }
    }
    for (const effect of state?.battleAnimations ?? []) {
      const age = state!.queue.nowUs - effect.atUs;
      if (effect.kind === "heal-link" && effect.target && age >= 0 && age < 500_000) {
        line(effect.x, effect.y, .9, effect.target.x, effect.target.y, .9);
      }
      if ((effect.kind === "spell-link" || effect.kind === "weapon-link") && effect.target && age >= 0 &&
          age < (effect.durationUs ?? (effect.kind === "spell-link" ? 700_000 : 250_000))) {
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
      if (effect.kind === "ice-shard" && age >= 0 && age < 500_000) {
        const { x, y } = effect;
        const height = 2.8 - age / 200_000;
        const radius = effect.unitId === "q015" ? 22 : 14;
        line(x - radius, y, .4, x, y, height);
        line(x, y, height, x + radius, y, .4);
        line(x, y - radius, .4, x, y, height);
        line(x, y, height, x, y + radius, .4);
      }
      const artillery = effect.kind === "artillery-impact";
      const stomp = effect.kind === "stomp-impact";
      const relocation = effect.kind === "relocation-impact";
      if (!artillery && !stomp && !relocation && effect.kind !== "revive" || age < 0 ||
          age >= (artillery ? 240_000 : stomp ? 800_000 : relocation ? 1_000_000 : 600_000)) continue;
      if (artillery) artilleryImpacts++;
      const radius = artillery ? 28 + age / 1700 : stomp ? 48 + age / 1500 :
        relocation ? 100 + age / 6500 : 30 + age / 3000;
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
      const label = title.name.replace("（工人）", "");
      if (workerTitle.textContent !== label) workerTitle.textContent = label;
      workerTitle.style.left = `${canvasLeft + (projectedTitle.x + 1) * width / 2}px`;
      workerTitle.style.top = `${canvasTop + (1 - projectedTitle.y) * height / 2}px`;
    }
    for (const [id, display] of fingerDisplays) {
      if (state?.structures.some(tower => tower.id === id && (tower.fingerDisplayUntilUs ?? 0) > state.queue.nowUs)) continue;
      display.remove();
      fingerDisplays.delete(id);
    }
    if (state) for (const tower of state.structures) {
      if (!tower.fingerDisplayUntilUs || tower.fingerDisplayUntilUs <= state.queue.nowUs) continue;
      let display = fingerDisplays.get(tower.id);
      if (!display) {
        display = document.createElement("span");
        display.className = "finger-stacks";
        canvas.after(display);
        fingerDisplays.set(tower.id, display);
      }
      const label = String(tower.fingerStacks);
      if (display.textContent !== label) display.textContent = label;
      const point = tower.fingerDisplayPoint ?? tower;
      projectedTitle.set(toWorld(point.x), 2.1, toWorld(point.y)).project(camera);
      display.hidden = Math.abs(projectedTitle.x) > 1 || Math.abs(projectedTitle.y) > 1;
      display.style.left = `${canvasLeft + (projectedTitle.x + 1) * width / 2}px`;
      display.style.top = `${canvasTop + (1 - projectedTitle.y) * height / 2}px`;
    }
    renderer.resetState();
    renderer.render(scene, camera);
    if (!state) return;
    // The MDX renderer shares this context but does not manage Three's instanced VAOs.
    renderer.resetState();
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
    for (const cloud of Object.values(state.acidClouds ?? {})) {
      const visual = modelFor("T102");
      visual?.model(camera, toWorld(cloud.point.x), toWorld(cloud.point.y), 0, elapsed, "Stand", visual.size);
    }
    for (const mark of Object.values(state.dragonImprints ?? {})) {
      const visual = modelFor("T003");
      visual?.model(camera, toWorld(mark.point.x), toWorld(mark.point.y), 0, elapsed, "Stand", visual.size);
    }
    for (const [id, shell] of Object.entries(state.ionShells ?? {})) {
      const recipient = state.structures.find(unit => unit.id === Number(id)) ?? state.summons?.find(unit => unit.id === Number(id));
      const point = recipient ?? shell.corpsePoint;
      const visual = modelFor("newsoularmor");
      if (point && visual) visual.model(camera, toWorld(point.x), toWorld(point.y), 0, elapsed, "Stand", visual.size);
    }
    const renderedTowers = [];
    const walkingWolves = [];
    const renderedDemonflame = [];
    const substituteActions = [];
    const troopAuras: { source: Match["structures"][number]; skill: NonNullable<ReturnType<typeof troopAuraSkill>> }[] = [];
    delete canvas.dataset.growthModelSize;
    const standingTowers = new Set(state.structures.map(tower => tower.id));
    for (const [id, last] of knownTowers) {
      if (standingTowers.has(id)) continue;
      knownTowers.delete(id);
      towerExits.push({ id, ...last, atUs: state.queue.nowUs });
    }
    for (const tower of state.structures) {
      if (tower.pending && !tower.pending.upgradeTo) continue;
      const skill = troopAuraSkill(tower);
      if (skill) troopAuras.push({ source: tower, skill });
      knownTowers.set(tower.id, { templateId: tower.templateId, x: tower.x, y: tower.y,
        modelScale: heroModelScale(tower.hero, tower.templateId) *
          (state.queue.nowUs < (tower.bloodlust?.untilUs ?? 0) ? 1.2 : 1) });
    }
    for (const { dueUs, payload } of state.queue.pending) {
      if (payload.type === "spell-sweep" && payload.sweep.name === "A074") {
        const { x, y, dx, dy, speed, range, startedUs } = payload.sweep;
        const ageUs = state.queue.nowUs - (startedUs ?? state.queue.nowUs);
        const distance = Math.min(range, Math.max(0, ageUs) * speed / 1_000_000);
        const visual = modelFor("T064");
        visual?.model(camera, toWorld(x + dx * distance), toWorld(y + dy * distance), Math.atan2(-dy, dx),
          ageUs / 1000, "Walk", visual.size);
        continue;
      }
      if (payload.type === "phantom-spear" || payload.type === "firestorm-projectile" || payload.type === "bounty-projectile" && payload.remaining !== undefined) {
        const target = state.enemies.find(unit => unit.id === payload.targetId);
        const visual = modelFor(payload.type === "phantom-spear" ? "T130" : payload.type === "firestorm-projectile" ? "T403" : "T090");
        if (!target || !visual) continue;
        const { position, travelUs } = payload;
        const distance = Math.hypot(target.x - position.x, target.y - position.y);
        const distanceFlown = Math.min(distance, Math.max(0, travelUs - dueUs + state.queue.nowUs) *
          (payload.type === "firestorm-projectile" ? 1400 : 1000) / 1_000_000);
        const progress = distance ? distanceFlown / distance : 1;
        visual.model(camera, toWorld(position.x + (target.x - position.x) * progress),
          toWorld(position.y + (target.y - position.y) * progress),
          Math.atan2(position.y - target.y, target.x - position.x), elapsed, "Stand", visual.size, .65);
        continue;
      }
      if (payload.type === "burning-spear") {
        const target = state.enemies.find(enemy => enemy.id === payload.targetId);
        if (target && canSeeEnemy(state, target)) {
          const visual = modelFor("A115");
          visual?.model(camera, toWorld(target.x), toWorld(target.y), 0, elapsed, "Stand", visual.size, .68);
        }
        continue;
      }
      if (payload.type === "weapon-impact" &&
          (payload.shot.arcaneOrbPaid || payload.shot.sourceTemplate === "H002" ||
            payload.shot.sourceTemplate === "G035" || payload.shot.sourceTemplate === "G043")) {
        const { shot, travelUs } = payload;
        const visualId = shot.arcaneOrbPaid ? "A083" :
          shot.sourceTemplate === "G035" ? "A099" : shot.sourceTemplate === "G043" ? "A097" : "A005";
        const visual = modelFor(visualId);
        if (!visual || travelUs <= 0) continue;
        const { point, destination, weapon } = shot;
        const distance = Math.hypot(destination.x - point.x, destination.y - point.y);
        if (!distance) continue;
        const distanceFlown = Math.min(distance, Math.max(0, travelUs - dueUs + state.queue.nowUs) * weapon.speed / 1_000_000);
        const fraction = distanceFlown / distance;
        const facing = Math.atan2(point.y - destination.y, destination.x - point.x);
        visual.model(camera, toWorld(point.x + (destination.x - point.x) * fraction),
          toWorld(point.y + (destination.y - point.y) * fraction), facing, elapsed, "Stand", visual.size, .7);
        continue;
      }
      if (payload.type === "morph-bolt" || payload.type === "death-pulse" || payload.type === "bristle-goo-projectile" ||
          payload.type === "doom-projectile" && payload.spell === "A200") {
        const target = state.enemies.find(unit => unit.id === payload.targetId);
        const visual = modelFor(payload.type === "bristle-goo-projectile" ? "T204" :
          payload.type === "morph-bolt" ? "T286" : payload.type === "death-pulse" ? payload.visual : "T225");
        if (!target || !visual) continue;
        const origin = payload.position;
        const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
        const speed = payload.type === "morph-bolt" ? 1000 : payload.type === "death-pulse" ? 640 : 800;
        const progress = distance ? Math.min(1, Math.max(0, payload.travelUs - dueUs + state.queue.nowUs) * speed / 1_000_000 / distance) : 0;
        const facing = Math.atan2(origin.y - target.y, target.x - origin.x);
        visual.model(camera, toWorld(origin.x + (target.x - origin.x) * progress),
          toWorld(origin.y + (target.y - origin.y) * progress), facing, elapsed, "Stand", visual.size, .7);
        continue;
      }
      if (payload.type === "razor-plasma") {
        const caster = state.structures.find(tower => tower.id === payload.towerId);
        if (!caster) continue;
        const step = (payload.tick - 1) % 46;
        const radius = Math.min(step, 45 - step);
        const ring = modelFor("AZ_diangun01_F_fx2");
        ring?.model(camera, toWorld(caster.x), toWorld(caster.y), 0, elapsed, "Stand", ring.size * radius / 8, .18);
        continue;
      }
      if (payload.type !== "zeus-cloud" || payload.visualUntilUs <= state.queue.nowUs) continue;
      const visual = modelFor(payload.visualModelId);
      visual?.model(camera, toWorld(payload.point.x), toWorld(payload.point.y), 0, elapsed, "Stand", visual.size, 2.8);
    }
    const drawnAuraSources: number[] = [];
    const drawnAuraRecipients: number[] = [];
    for (const tower of [...state.structures, ...(state.summons ?? [])]) {
      const visuals = modelFor(tower.templateId);
      if (!visuals || tower.pending && !tower.pending.upgradeTo) continue;
      if (troopAuras.length && (tower.life?.hp ?? 1) > 0 && !tower.sleight) {
        const ownSkill = troopAuraSkill(tower);
        const ownModel = ownSkill && modelFor(ownSkill);
        if (ownModel) {
          ownModel.model(camera, toWorld(tower.x), toWorld(tower.y), 0, elapsed, "Stand", ownModel.size);
          drawnAuraSources.push(tower.id);
        }
        const active = troopAuras.find(({ source, skill }) => troopAuraInRange(source, tower) &&
          weapons[tower.templateId]?.some(weapon => troopAuraAffects(skill, weapon)));
        const targetModel = active && modelFor(active.skill === "N016" ? "BOac" : active.skill === "N103" ? "B017" : "B018");
        if (targetModel) {
          targetModel.model(camera, toWorld(tower.x), toWorld(tower.y), 0, elapsed, "Stand", targetModel.size,
            tower.spiritOrder ? toWorld(380) : tower.dragonShape ? toWorld(150) : 0);
          drawnAuraRecipients.push(tower.id);
        }
      }
      if (tower.morphShift) {
        const morph = modelFor(tower.morphShift.attribute === "STR" ? "morph_str_1" : "morph_agi_1");
        morph?.model(camera, toWorld(tower.x), toWorld(tower.y), 0, elapsed, "Stand", morph.size, .4);
      }
      if (tower.illuminateCharge) {
        const orb = tower.illuminateCharge.orb;
        const visual = modelFor("FarseerMissile");
        visual?.model(camera, toWorld(orb.x), toWorld(orb.y), 0, elapsed - tower.illuminateCharge.startedUs / 1000, "Stand", visual.size, .5);
      }
      const attackTime = tower.lastAttackUs === undefined ? Infinity : elapsed - tower.lastAttackUs / 1000;
      const castTime = tower.lastCastUs === undefined ? Infinity : elapsed - tower.lastCastUs / 1000;
      const channeling = (tower.snow !== undefined || tower.leashToken !== undefined || tower.swordRainToken !== undefined ||
        tower.freezingFieldId !== undefined || tower.rearmTimer !== undefined || tower.illuminateCharge !== undefined) &&
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
      const size = visuals.size * heroModelScale(tower.hero, tower.templateId) *
        (state.queue.nowUs < (tower.bloodlust?.untilUs ?? 0) ? 1.2 : 1);
      const tint = tower.godsStrength?.variant === "A063"
        ? state.queue.nowUs < tower.godsStrength.untilUs ? "red" : "blue" : undefined;
      const action = visuals.model(camera, toWorld(tower.x), toWorld(tower.y), facing,
        casting ? channeling ? castTime % 450 : castTime : attacking ? attackFrame : elapsed,
        casting ? "Spell" : walking ? "Walk" : attacking ? "Attack" : "Stand", size,
        tower.spiritOrder ? toWorld(380) : tower.dragonShape ? toWorld(150) : 0, tint, !!tower.sleight);
      if (tower.sleight) {
        const ghost = modelFor(tower.sleight.visual);
        ghost?.model(camera, toWorld(tower.sleight.x), toWorld(tower.sleight.y), facing,
          elapsed, "Stand", ghost.size, 0, undefined, true);
      }
      if (tower.flameGuard) {
        const flame = modelFor(tower.templateId === "G065" ? "A179G065" : "A179");
        flame?.model(camera, toWorld(tower.x), toWorld(tower.y), facing, elapsed, "Stand", flame.size);
      }
      if (tower.pressTheAttack && tower.pressTheAttack.untilUs > state.queue.nowUs) {
        const visual = modelFor("A133");
        visual?.model(camera, toWorld(tower.x), toWorld(tower.y), 0, elapsed, "Stand", visual.size, 1);
      }
      if (tower.innerVitality) {
        const visual = modelFor("HuoXueShu");
        visual?.model(camera, toWorld(tower.x), toWorld(tower.y), 0, elapsed, "Stand", visual.size, .55);
      }
      if (tower.duel) {
        const { targetId, point, skin, untilUs } = tower.duel;
        const ageUs = state.queue.nowUs - untilUs + 5_000_000;
        const target = state.enemies.find(enemy => enemy.id === targetId);
        if (skin && ageUs < 5_000_000) {
          const visual = modelFor("JueDouing");
          visual?.model(camera, toWorld(point.x), toWorld(point.y), 0, ageUs / 1000, "Stand", visual.size);
        }
        if (ageUs < 4_000_000) {
          const visual = modelFor("JueDou");
          visual?.model(camera, toWorld(tower.x), toWorld(tower.y), 0, ageUs / 1000, "Stand", visual.size, 1.3);
          if (target) visual?.model(camera, toWorld(target.x), toWorld(target.y), 0, ageUs / 1000, "Stand", visual.size, 1.3);
        }
      }
      const slash = tower.omnislash;
      if (slash) {
        const visual = modelFor(slash.templateId);
        const age = elapsed - slash.lastAttackUs / 1000;
        visual?.model(camera, toWorld(slash.x), toWorld(slash.y), slash.facing * Math.PI / 180,
          Math.max(0, age), age < 400 ? "Attack" : "Stand", visual.size);
      }
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
    if (state.wildAxes) {
      const blade = modelFor("q053");
      if (blade) for (const flight of Object.values(state.wildAxes)) for (const axe of flight.axes) {
        blade.model(camera, toWorld(axe.x), toWorld(axe.y), flight.step * .7, elapsed, "Stand", blade.size, .48);
      }
    }
    canvas.dataset.renderedDemonflame = renderedDemonflame.join(",");
    canvas.dataset.towerActionSubstitutes = substituteActions.join(",");
    if (troopAuras.length || canvas.dataset.troopAuraSources) {
      canvas.dataset.troopAuraSources = drawnAuraSources.join(",");
      canvas.dataset.troopAuraRecipients = drawnAuraRecipients.join(",");
    }
    const renderedEnemies = new Set<string>();
    const castingEnemies = new Set<string>();
    const deathAuras = state.structures.filter(tower => tower.hero?.ranks.A235 && !tower.pending && (tower.life?.hp ?? 1) > 0);
    for (const enemy of state.enemies) {
      if (!canSeeEnemy(state, enemy) || state.queue.nowUs < (enemy.phaseUntilUs ?? 0)) continue;
      const hexed = enemy.hexSourceId !== undefined || state.queue.nowUs < (enemy.hexUntilUs ?? 0);
      const visuals = (hexed ? modelFor(enemy.hexForm ?? "nsha") : undefined) ?? modelFor(enemy.unitId);
      if (!visuals) continue;
      const target = enemy.path?.[0] ?? map.waypoints[enemy.waypoint];
      const facing = Math.atan2(enemy.y - target.y, target.x - enemy.x);
      const stopped = state.queue.nowUs < Math.max(enemy.stunUntilUs ?? 0, enemy.wraithMarkUntilUs ?? 0, enemy.iceBindingUntilUs ?? 0, enemy.bearRootUntilUs ?? 0, enemy.bearRoarUntilUs ?? 0, enemy.doomUntilUs ?? 0, enemy.duelLockUntilUs ?? 0, enemy.searingChainsUntilUs ?? 0) || !!enemy.leashes?.length || !!enemy.torrentLift || !!enemy.ravageLift || !!enemy.impaleLift || !!enemy.oraclePauseUntilUs;
      const castAge = state.queue.nowUs - Math.max(enemy.graveCastUs ?? -Infinity, enemy.lastSpellUs ?? -Infinity);
      const casting = !hexed && !stopped && castAge < 500_000;
      const stone = enemy.stoneGaze;
      const frozen = stone?.frozenFrameUs !== undefined;
      const clip = frozen ? "Walk" : casting ? "Spell" : stopped || enemy.welfare ? "Stand" : "Walk";
      const lift = toWorld((enemy.torrentLift?.height ?? 0) + (enemy.ravageLift?.height ?? 0) + (enemy.impaleLift?.height ?? 0)) +
        (enemy.welfare ? .07 + .055 * Math.sin((elapsed + enemy.id * 87) / 120) : 0);
      const modelTime = frozen ? stone.frozenFrameUs! / 1000 + enemy.id * 87 : casting ? castAge / 1000 : elapsed + enemy.id * 87;
      const action = visuals.model(camera, toWorld(enemy.x), toWorld(enemy.y), facing, modelTime, clip, visuals.size, lift,
        frozen && !stone.crystalline ? "stone" : undefined, !!enemy.replica);
      if (frozen && stone.crystalline) {
        const crystal = modelFor("AZ_ShuiJingShiHua");
        crystal?.model(camera, toWorld(enemy.x), toWorld(enemy.y), 0, elapsed, "Stand", crystal.size);
      }
      if (enemy.shadowWindSlow) {
        const wind = modelFor("X003");
        wind?.model(camera, toWorld(enemy.x), toWorld(enemy.y), facing, elapsed, "Stand", wind.size);
      }
      if (enemy.bristleGooSlow) {
        const goo = modelFor("B149");
        goo?.model(camera, toWorld(enemy.x), toWorld(enemy.y), facing, elapsed, "Stand", goo.size, lift + .62);
      }
      if (deathAuras.some(tower => (tower.x - enemy.x) ** 2 + (tower.y - enemy.y) ** 2 <= 700 ** 2) &&
          !enemy.abilities?.some(id => ["Amim", "ACm2", "ACm3", "ACmi", "AImu", "AImx", "T060", "Aloc"].includes(id))) {
        const aura = modelFor("A235");
        aura?.model(camera, toWorld(enemy.x), toWorld(enemy.y), 0, elapsed, "Stand", aura.size);
      }
      if (enemy.unitId === "m001") canvas.dataset.enemyModelFrame = String(action.frame);
      renderedEnemies.add(enemy.unitId);
      if (casting) castingEnemies.add(enemy.unitId);
    }
    const animations: NonNullable<Match["battleAnimations"]> = state.battleAnimations ?? (state.recentHits ?? []).flatMap(hit =>
      hit.deadUnitId ? [{ ...hit, unitId: hit.deadUnitId, kind: "death" as const }] : []);
    const renderedDeaths = [];
    const renderedRevives = [];
    for (const effect of animations) {
      const age = elapsed - effect.atUs / 1000;
      if (effect.kind === "model-effect" && ["T205", "T198", "T199", "staraura", "AZ_diangun01_F_fx2"].includes(effect.unitId)) {
        const visual = modelFor(effect.unitId);
        const duration = effect.unitId === "T205" ? 1000 / 1.2 : (effect.durationUs ?? 600_000) / 1000;
        if (visual && age >= 0 && age < duration) {
          const progress = age / duration;
          const dx = (effect.target?.x ?? effect.x) - effect.x;
          const dy = (effect.target?.y ?? effect.y) - effect.y;
          visual.model(camera, toWorld(effect.x + dx * progress), toWorld(effect.y + dy * progress),
            Math.atan2(-dy, dx), age, "Stand", visual.size, effect.unitId === "T205" ? .5 : 0);
        }
        continue;
      }
      if (effect.kind === "model-effect" &&
          ["darkmending", "HAJT1", "fatesedict", "falsepromise", "HAJT3", "shenYuZhe", "HAJT2", "A178", "A178G065"].includes(effect.unitId)) {
        const attached = effect.enemyId !== undefined ? state.enemies.find(enemy => enemy.id === effect.enemyId) : undefined;
        if (effect.enemyId !== undefined && (!attached || !canSeeEnemy(state, attached))) continue;
        const visual = modelFor(effect.unitId);
        const point = attached ?? effect;
        const lift = effect.unitId === "darkmending" || effect.unitId === "HAJT1" ||
          effect.unitId === "falsepromise" || effect.unitId === "HAJT3" ? .65 : 0;
        if (visual && age >= 0 && age < (effect.durationUs ?? 1_000_000) / 1000)
          visual.model(camera, toWorld(point.x), toWorld(point.y), 0, age, "Stand", visual.size, lift);
        continue;
      }
      if (effect.kind === "model-effect" && ["H119", "T172", "T260", "H120", "T276", "T277", "T279"].includes(effect.unitId)) {
        const destination = effect.target;
        const speed = effect.unitId === "T276" ? 1.4 : effect.unitId === "T279" ? 1 : 3;
        const duration = effect.durationUs !== undefined ? effect.durationUs / 1000 :
          Math.max(1, Math.hypot((destination?.x ?? effect.x) - effect.x, (destination?.y ?? effect.y) - effect.y) / speed);
        const model = modelFor(effect.unitId);
        if (model && age >= 0 && age < duration) {
          const progress = age / duration;
          const dx = (destination?.x ?? effect.x) - effect.x;
          const dy = (destination?.y ?? effect.y) - effect.y;
          model.model(camera, toWorld(effect.x + dx * progress), toWorld(effect.y + dy * progress),
            Math.atan2(-dy, dx), age, "Stand", model.size, destination ? .75 : 0);
        }
        continue;
      }
      if (effect.kind === "model-effect" && ["T231", "N731", "netherinferno", "UndeadMineCircle", "FeralSpiritTarget"].includes(effect.unitId)) {
        const destination = effect.target;
        const duration = destination ? Math.max(1, Math.hypot(destination.x - effect.x, destination.y - effect.y) /
          (effect.unitId === "N731" ? 1.8 : 1)) : 650;
        const model = modelFor(effect.unitId);
        if (model && age >= 0 && age < duration) {
          const progress = age / duration;
          const x = effect.x + ((destination?.x ?? effect.x) - effect.x) * progress;
          const y = effect.y + ((destination?.y ?? effect.y) - effect.y) * progress;
          const lift = destination ? .2 + .2 * Math.sin(Math.PI * progress) : 0;
          model.model(camera, toWorld(x), toWorld(y), 0, age, "Stand", model.size, lift);
        }
        continue;
      }
      if (effect.kind === "model-effect" && ["T216", "T217", "calldown_flyup", "calldown_flydown", "jijie", "calldown_4", "VolcanoMissile"].includes(effect.unitId)) {
        const rocket = effect.unitId === "T216" || effect.unitId === "T217";
        const target = effect.target ?? effect;
        const duration = rocket ? Math.max(1, Math.hypot(target.x - effect.x, target.y - effect.y) / (effect.unitId === "T216" ? .9 : 1.6)) :
          effect.unitId === "calldown_flyup" ? 1000 : effect.unitId === "VolcanoMissile" ? 500 : 2000;
        if (age >= 0 && age < duration) {
          const progress = age / duration;
          const x = effect.x + (target.x - effect.x) * progress;
          const y = effect.y + (target.y - effect.y) * progress;
          const lift = rocket ? .2 + .2 * Math.sin(Math.PI * progress) : effect.unitId === "calldown_flyup" ? progress :
            effect.unitId === "calldown_flydown" ? 1 - progress : effect.unitId === "VolcanoMissile" ? toWorld(-150) : 0;
          const facing = Math.atan2(effect.y - target.y, target.x - effect.x);
          const visual = modelFor(effect.unitId);
          visual?.model(camera, toWorld(x), toWorld(y), facing, age, "Stand", visual.size, lift);
        }
        continue;
      }
      if (effect.kind === "model-effect" && (effect.unitId === "q055" || effect.unitId === "q058")) {
        if (age < 0 || age >= 780) continue;
        const target = effect.target!;
        const model = modelFor(effect.unitId);
        const fraction = Math.min(12, Math.floor(age / 60)) / 12;
        const x = effect.x + (target.x - effect.x) * fraction;
        const y = effect.y + (target.y - effect.y) * fraction;
        model?.model(camera, toWorld(x), toWorld(y), Math.atan2(effect.y - target.y, target.x - effect.x), age, "Stand", model.size, .18);
        continue;
      }
      if (effect.kind === "model-effect") {
        const attached = effect.enemyId === undefined ? undefined : state.enemies.find(enemy => enemy.id === effect.enemyId);
        if (effect.enemyId !== undefined && (!attached || !canSeeEnemy(state, attached))) continue;
        if (effect.unitId === "T409" && attached?.illuminateBlindUntilUs !== effect.atUs + effect.durationUs!) continue;
        const dragonBreath = effect.unitId === "A008" || effect.unitId === "A008G077";
        const spin = effect.unitId === "T1837";
        const coupGround = effect.unitId.startsWith("PhantomAssassin_C");
        const coupWeapon = effect.unitId === "AZ_PA_C";
        const ghostShip = effect.unitId === "T079" || effect.unitId === "T080";
        const soulTravel = ghostShip || effect.unitId === "ChimaeraLightningMissile" || effect.unitId === "LightningBoltMissile" || effect.unitId === "T207" || effect.unitId === "T408" || effect.unitId === "T001" || effect.unitId === "T135" || effect.unitId === "T136" || effect.unitId === "A064";
        const manaBreak = effect.unitId === "SpellBreakerAttack" || effect.unitId === "AZ_D036";
        const duration = effect.durationUs !== undefined ? effect.durationUs / 1000 : spin ? 400 : dragonBreath ? 2000 : effect.unitId === "A132" ? 200 : ghostShip ? 1750 : effect.unitId === "A064" ? 1000 / 1.1 : effect.unitId === "T1946" ? 500 : effect.unitId === "FrostArmorTarget" ? 8000 : coupGround || coupWeapon || effect.unitId === "SJ_XF" || effect.unitId === "T131" ? 4000 : effect.unitId === "FaerieFire" ? 10000 : effect.unitId === "T098" ? 5000 : effect.unitId === "TauntCaster" ? 2000 : effect.unitId === "B137" ? 7000 :
          effect.unitId === "T051" || effect.unitId === "T051G041" ? 5000 : effect.unitId === "superdarkflash" ? 1500 :
          manaBreak ? 500 : soulTravel || ["DoomDeath", "MCXX1", "XiaoYuRenAtt", "Disenchant", "T664", "enchantment", "A084", "ShuiDaoHands"].includes(effect.unitId) ? 1000 : 800;
        if (age >= 0 && age < duration) {
          const visual = modelFor(effect.unitId);
          const facing = effect.target && (coupGround || coupWeapon || soulTravel || dragonBreath || effect.unitId === "q063") ?
            Math.atan2(effect.y - effect.target.y, effect.target.x - effect.x) + (coupGround ? Math.PI : 0) : 0;
          const point = soulTravel && effect.target ? {
            x: effect.x + (effect.target.x - effect.x) * age / duration,
            y: effect.y + (effect.target.y - effect.y) * age / duration,
          } : attached ?? effect;
          visual?.model(camera, toWorld(point.x), toWorld(point.y), spin ? age / 60 : facing, effect.unitId === "A132" ? age * 4 : age, "Stand", visual.size,
            effect.unitId === "Disenchant" || effect.unitId === "FaerieFire" || effect.unitId === "FarseerMissile" || coupWeapon ? .6 : 0);
        }
        continue;
      }
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
  return Object.assign(render, { resetView, setView, rotateView, zoomView, pointAt, preloadMatch,
    setOrbit(active: boolean) { orbit = active; canvas.dataset.orbit = String(active); },
    showAttackRange(point: Point | undefined, range: number) {
      rangeRing.visible = !!point && range > 0;
      if (point && range > 0) {
        rangeRing.position.set(toWorld(point.x), .12, toWorld(point.y));
        rangeRing.scale.setScalar(toWorld(range));
      }
      const value = String(range);
      if (canvas.dataset.attackRange !== value) canvas.dataset.attackRange = value;
    },
    focusAt(point: Point) { focus.set(toWorld(point.x), 0, toWorld(point.y)); project(); },
    screenAt(point: Point) {
      projectedPoint.set(toWorld(point.x), 1, toWorld(point.y)).project(camera);
      return { x: (projectedPoint.x + 1) * size.x / 2, y: (1 - projectedPoint.y) * size.y / 2 };
    }
  });
}
