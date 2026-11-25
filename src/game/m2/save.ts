import { configuration, contentVersion, previousContentVersions, saveFormatVersion } from "./content.ts";

type RunIdentity = { matchId: string };
type Head = { revision: number; activeMatchId: string };

export type Checkpoint<Profile, Run extends RunIdentity> = Head & {
  formatVersion: typeof saveFormatVersion;
  contentVersion: typeof contentVersion | typeof previousContentVersions[number];
  configVersion: string;
  profile: Profile;
  run: Run;
};

export class StaleM2Checkpoint extends Error {
  constructor() {
    super("档案修订或当前对局已更新，本次保存已拒绝。");
  }
}

const { database, lock, slot } = configuration.persistence;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("profiles");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export function createM2SaveStore<Profile, Run extends RunIdentity>(
  validProfile: (value: unknown) => value is Profile,
  validRun: (value: unknown) => value is Run,
) {
  let connection: Promise<IDBDatabase> | undefined;

  function decode(value: unknown): Checkpoint<Profile, Run> | undefined {
    if (value === undefined) return;
    if (value && typeof value === "object") {
      const row = value as Partial<Checkpoint<Profile, Run>>;
      if (row.formatVersion === saveFormatVersion && (row.contentVersion === contentVersion || previousContentVersions.some(version => version === row.contentVersion)) &&
        row.configVersion === configuration.version &&
        typeof row.revision === "number" && Number.isSafeInteger(row.revision) && row.revision >= 1 &&
        typeof row.activeMatchId === "string" && row.activeMatchId.length > 0 &&
        validProfile(row.profile) && validRun(row.run) && row.run.matchId === row.activeMatchId) {
        return row as Checkpoint<Profile, Run>;
      }
    }
    throw new Error("M2 存档格式、内容版本或数据不兼容，原记录已保留。");
  }

  async function transaction<T>(
    mode: IDBTransactionMode,
    use: (store: IDBObjectStore, current: Checkpoint<Profile, Run> | undefined) => T,
  ) {
    const db = await (connection ??= openDatabase().catch(error => {
      connection = undefined;
      throw error;
    }));
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("profiles", mode);
      const store = tx.objectStore("profiles");
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new DOMException("M2 存档事务中止", "AbortError"));
      const read = store.get(slot);
      read.onsuccess = () => {
        try {
          result = use(store, decode(read.result));
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
    });
  }

  const read = () => transaction("readonly", (_, current) => current);

  function withWriter<T>(
    runSession: (session: {
      checkpoint: Checkpoint<Profile, Run> | undefined;
      commit: (expected: Head | undefined, profile: Profile, run: Run) => Promise<Head>;
      restart: (expected: Head, profile: Profile, run: Run) => Promise<Head>;
    }) => Promise<T>,
    signal?: AbortSignal,
  ) {
    if (!globalThis.navigator?.locks) {
      return Promise.reject(new Error("此浏览器不支持 Web Locks。请在支持 Web Locks 的浏览器中打开 M2。"));
    }
    return navigator.locks.request(lock, { mode: "exclusive", signal }, async () => {
      const checkpoint = await read();
      let held = true;
      const inFlight = new Set<Promise<Head>>();
      function writeCheckpoint(expected: Head | undefined, profile: Profile, run: Run, replacing: boolean) {
        if (!held) return Promise.reject(new StaleM2Checkpoint());
        const copy = structuredClone({ expected, profile, run });
        const write = transaction("readwrite", (store, current) => {
          if (!held || copy.expected?.revision !== current?.revision ||
            copy.expected?.activeMatchId !== current?.activeMatchId ||
            (current !== undefined && replacing === (copy.run.matchId === current.activeMatchId))) {
            throw new StaleM2Checkpoint();
          }
          const row = decode({
            formatVersion: saveFormatVersion, contentVersion, configVersion: configuration.version,
            revision: (current?.revision ?? 0) + 1, activeMatchId: copy.run.matchId,
            profile: copy.profile, run: copy.run,
          })!;
          store.put(row, slot);
          return { revision: row.revision, activeMatchId: row.activeMatchId };
        });
        inFlight.add(write);
        void write.then(() => inFlight.delete(write), () => inFlight.delete(write));
        return write;
      }
      try {
        return await runSession({
          checkpoint,
          commit: (expected, profile, run) => writeCheckpoint(expected, profile, run, false),
          restart: (expected, profile, run) => writeCheckpoint(expected, profile, run, true),
        });
      } finally {
        held = false;
        await Promise.allSettled(inFlight);
      }
    });
  }

  return { read, withWriter };
}
