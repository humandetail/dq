import { contentVersion } from "./content.ts";
import { saveFormatVersion, type SaveSnapshot } from "./state.ts";

type Status = "saved" | "superseded";
type Job = { snapshot: SaveSnapshot; resolve: (status: Status) => void; reject: (error: unknown) => void };

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

  async function restore() {
    const db = await database;
    const snapshot = await new Promise<SaveSnapshot | undefined>((resolve, reject) => {
      const request = db.transaction("runs").objectStore("runs").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (snapshot !== undefined && (
      snapshot?.formatVersion !== saveFormatVersion ||
      snapshot.contentVersion !== contentVersion ||
      typeof snapshot.state?.matchId !== "string" ||
      !Number.isSafeInteger(snapshot.revision) ||
      !Array.isArray(snapshot.state.events) ||
      !Array.isArray(snapshot.state.commands) ||
      !Number.isSafeInteger(snapshot.clock?.pendingFrames)
    )) throw new Error("存档格式或内容版本不兼容，原存档已保留。");

    return snapshot;
  }

  return { save, restore };
}
