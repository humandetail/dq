import { contentVersion, endlessWave, enemies, frameMs, items, mainline, map, previousContentVersion, recipes, shop, towers } from "./content.ts";
import { saveFormatVersion, type SaveSnapshot } from "./state.ts";

type Status = "saved" | "superseded";
type Job = { snapshot: SaveSnapshot; resolve: (status: Status) => void; reject: (error: unknown) => void };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown): value is number => number(value) && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const key = (value: unknown, options: object) => text(value) && Object.hasOwn(options, value);
const list = (value: unknown, check: (entry: Record<string, unknown>) => boolean) =>
  Array.isArray(value) && value.every(entry => record(entry) && check(entry));
const point = (value: unknown) => record(value) && number(value.x) && number(value.y);
const reasons = ["phase", "missing", "occupied", "gold", "capacity", "stock", "materials", "max-level", "range", "cooldown"];

function validAction(value: unknown) {
  if (!record(value)) return false;
  switch (value.type) {
    case "build": return integer(value.cardId) && key(value.site, map.buildSites);
    case "upgrade":
    case "overcharge": return integer(value.towerId);
    case "draw": return true;
    case "buy": return key(value.item, shop);
    case "craft": return key(value.recipe, recipes) && Array.isArray(value.materialIds) && value.materialIds.every(integer);
    case "equip": return integer(value.itemId) && integer(value.towerId);
    case "attack": return integer(value.towerId) && integer(value.targetId);
    default: return false;
  }
}

function validSpawn(mode: unknown, waveNumber: unknown, batchIndex: unknown) {
  if (!integer(waveNumber) || waveNumber < 1 || !integer(batchIndex)) return false;
  if (mode === "mainline") {
    const wave = mainline.waves[waveNumber - 1];
    return wave !== undefined && batchIndex < wave.batches.length;
  }
  try {
    return batchIndex < endlessWave(waveNumber).batches.length;
  } catch {
    return false;
  }
}

function validSnapshot(value: unknown): value is SaveSnapshot {
  if (!record(value) || !record(value.state) || !record(value.clock)) return false;
  const { state, clock } = value;
  const validPhase = state.mode === "mainline" && (state.phase === "mainline" || state.phase === "mainline-won") ||
    state.mode === "endless" && state.phase === "endless" ||
    (state.mode === "mainline" || state.mode === "endless") && state.phase === "failed" && integer(state.containmentPoints);
  const stock = state.stock;
  return value.formatVersion === saveFormatVersion &&
    (value.contentVersion === contentVersion || value.contentVersion === previousContentVersion) &&
    integer(value.revision) && text(state.matchId) && validPhase &&
    [state.frame, state.modeStartFrame, state.currentWave, state.lastCompletedWave, state.lastScheduledWave,
      state.gold, state.randomState, state.nextInstanceId, state.nextCommandSequence, state.nextEventSequence].every(integer) &&
    (clock.speed === 1 || clock.speed === 4) && typeof clock.paused === "boolean" && integer(clock.pendingFrames) &&
    number(clock.remainderMs) && clock.remainderMs >= 0 && clock.remainderMs < frameMs &&
    record(stock) && Object.keys(shop).every(item => integer(stock[item])) &&
    list(state.waves, wave => [wave.number, wave.remainingBatches, wave.livingEnemies].every(integer)) &&
    list(state.towers, tower => {
      const type = tower.type;
      return typeof type === "string" && Object.hasOwn(towers, type) && integer(tower.level) && tower.level > 0 &&
        tower.level <= towers[type as keyof typeof towers].levels.length && integer(tower.id) &&
        key(tower.site, map.buildSites) && integer(tower.attackReadyFrame) &&
        record(tower.skillReadyFrames) && Object.values(tower.skillReadyFrames).every(integer);
    }) &&
    list(state.enemies, enemy => integer(enemy.id) && key(enemy.type, enemies) && integer(enemy.wave) &&
      point(enemy.position) && integer(enemy.nextWaypoint) && enemy.nextWaypoint < map.route.length && number(enemy.hp)) &&
    list(state.cards, card => integer(card.id) && key(card.tower, towers)) &&
    list(state.items, item => integer(item.id) && key(item.type, items) && record(item.owner) &&
      (item.owner.type === "backpack" || item.owner.type === "tower" && integer(item.owner.id))) &&
    list(state.effects, effect => integer(effect.id) && text(effect.type) && integer(effect.targetId) &&
      integer(effect.expiresFrame) && number(effect.magnitude)) &&
    list(state.events, event => integer(event.sequence) && integer(event.targetFrame) &&
      (event.type === "spawn" && validSpawn(state.mode, event.wave, event.batchIndex) ||
        event.type === "expire-effect" && integer(event.effectId) ||
        event.type === "damage" && integer(event.sourceId) && integer(event.targetId) && number(event.amount))) &&
    list(state.commands, command => command.matchId === state.matchId && text(command.id) &&
      integer(command.sequence) && integer(command.targetFrame) && validAction(command.action)) &&
    list(state.results, result => text(result.id) && integer(result.sequence) &&
      (result.ok === true && (result.createdId === undefined || integer(result.createdId)) ||
        result.ok === false && typeof result.reason === "string" && reasons.includes(result.reason)));
}

export function createSaveStore(name = "td3") {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("runs");
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  let active = false;
  let pending: Job | undefined;

  async function write(job: Job) {
    active = true;
    try {
      const db = await database;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("runs", "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new DOMException("存档事务中止", "AbortError"));
        try {
          transaction.objectStore("runs").put(job.snapshot, "current");
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
      job.resolve("saved");
    } catch (error) {
      job.reject(error);
    } finally {
      active = false;
      const next = pending;
      pending = undefined;
      if (next) void write(next);
    }
  }

  function save(snapshot: SaveSnapshot) {
    const copy = structuredClone(snapshot);
    return new Promise<Status>((resolve, reject) => {
      const job = { snapshot: copy, resolve, reject };
      if (!active) void write(job);
      else {
        pending?.resolve("superseded");
        pending = job;
      }
    });
  }

  async function restore(): Promise<SaveSnapshot | undefined> {
    const db = await database;
    const snapshot = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction("runs").objectStore("runs").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (snapshot === undefined) return;
    if (!validSnapshot(snapshot)) throw new Error("存档格式或内容版本不兼容，原存档已保留。");
    return { ...snapshot, contentVersion };
  }

  return { save, restore };
}
