import { configuration, contentVersion, previousContentVersions, saveFormatVersion } from "./content.ts";
import { m3ConfigVersion, m3ContentVersion, m3Persistence, m3SaveFormatVersion } from "./m3-version.ts";

export type Migration = { source: "none" } | {
  source: "m2"; revision: number; activeMatchId: string; contentVersion: string;
};

type RunIdentity = { matchId: string };
type Head = { revision: number; activeMatchId: string };

export type Checkpoint<Profile, Run extends RunIdentity> = Head & {
  formatVersion: typeof m3SaveFormatVersion;
  contentVersion: typeof m3ContentVersion;
  migration: Migration;
  configVersion: string;
  profile: Profile;
  run: Run;
};

export class StaleM3Checkpoint extends Error {
  constructor() {
    super("档案修订或当前对局已更新，本次保存已拒绝。");
  }
}

const { database, lock, slot } = m3Persistence;

const validRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const legacyContent = (value: unknown): value is string =>
  value === contentVersion || previousContentVersions.some(version => version === value);

function validMigration(value: Migration | undefined): value is Migration {
  return value?.source === "none" || value?.source === "m2" && validRevision(value.revision) &&
    validId(value.activeMatchId) && legacyContent(value.contentVersion);
}

function openDatabase(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("profiles");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export function createM3SaveStore<Profile, Run extends RunIdentity>(
  validProfile: (value: unknown) => value is Profile,
  validRun: (value: unknown) => value is Run,
) {
  let connection: Promise<IDBDatabase> | undefined;

  function decode(value: unknown): Checkpoint<Profile, Run> | undefined {
    if (value === undefined) return;
    if (value && typeof value === "object") {
      const row = value as Partial<Checkpoint<Profile, Run>>;
      if (row.formatVersion === m3SaveFormatVersion && row.contentVersion === m3ContentVersion &&
        row.configVersion === m3ConfigVersion && validMigration(row.migration) &&
        validRevision(row.revision) && validId(row.activeMatchId) &&
        validProfile(row.profile) && validRun(row.run) && row.run.matchId === row.activeMatchId) {
        return row as Checkpoint<Profile, Run>;
      }
    }
    throw new Error("M3 存档格式、内容版本或数据不兼容，原记录已保留。");
  }

  async function transaction<T>(
    mode: IDBTransactionMode,
    use: (store: IDBObjectStore, current: Checkpoint<Profile, Run> | undefined) => T,
  ) {
    const db = await (connection ??= openDatabase(database).catch(error => {
      connection = undefined;
      throw error;
    }));
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("profiles", mode);
      const store = tx.objectStore("profiles");
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new DOMException("M3 存档事务中止", "AbortError"));
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
      commit: (expected: Head | undefined, profile: Profile, run: Run, migration?: Migration) => Promise<Head>;
      restart: (expected: Head, profile: Profile, run: Run) => Promise<Head>;
    }) => Promise<T>,
    signal?: AbortSignal,
  ) {
    if (!globalThis.navigator?.locks) {
      return Promise.reject(new Error("此浏览器不支持 Web Locks。请在支持 Web Locks 的浏览器中打开 M3。"));
    }
    return navigator.locks.request(lock, { mode: "exclusive", signal }, async () => {
      const checkpoint = await read();
      let held = true;
      const inFlight = new Set<Promise<Head>>();
      function writeCheckpoint(expected: Head | undefined, profile: Profile, run: Run, replacing: boolean, migration?: Migration) {
        if (!held) return Promise.reject(new StaleM3Checkpoint());
        const copy = structuredClone({ expected, profile, run, migration });
        const write = transaction("readwrite", (store, current) => {
          if (!held || copy.expected?.revision !== current?.revision ||
            copy.expected?.activeMatchId !== current?.activeMatchId ||
            (current !== undefined && replacing === (copy.run.matchId === current.activeMatchId))) {
            throw new StaleM3Checkpoint();
          }
          const row = decode({
            formatVersion: m3SaveFormatVersion, contentVersion: m3ContentVersion, configVersion: m3ConfigVersion,
            migration: current?.migration ?? copy.migration,
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
          commit: (expected, profile, run, migration) => writeCheckpoint(expected, profile, run, false, migration),
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

export async function withM2Archive<Profile, T>(
  validProfile: (value: unknown) => value is Profile,
  migrate: (profile: Profile | undefined, source: Migration) => Promise<T>,
  waiting: () => void,
  signal: AbortSignal,
) {
  const legacy = configuration.persistence;
  async function readAndMigrate() {
    const existing = (await indexedDB.databases()).some(db => db.name === legacy.database);
    signal.throwIfAborted();
    if (!existing) return migrate(undefined, { source: "none" });
    const db = await openDatabase(legacy.database);
    try {
      const value: unknown = await new Promise((resolve, reject) => {
        const tx = db.transaction("profiles", "readonly");
        const request = tx.objectStore("profiles").get(legacy.slot);
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
      signal.throwIfAborted();
      if (value === undefined) return await migrate(undefined, { source: "none" });
      if (value !== null && typeof value === "object") {
        const row = value as Record<string, unknown>;
        if (row.formatVersion === saveFormatVersion && legacyContent(row.contentVersion) &&
          row.configVersion === configuration.version && validRevision(row.revision) &&
          validId(row.activeMatchId) && validProfile(row.profile)) {
          return await migrate(row.profile, { source: "m2", revision: row.revision,
            activeMatchId: row.activeMatchId, contentVersion: row.contentVersion });
        }
      }
      throw new Error("M2 档案格式、内容版本或数据不兼容，原记录已保留。");
    } finally {
      db.close();
    }
  }

  signal.throwIfAborted();
  const immediate = await navigator.locks.request(legacy.lock, { ifAvailable: true }, async lock =>
    lock ? { value: await readAndMigrate() } : undefined);
  if (immediate) return immediate.value;
  signal.throwIfAborted();
  waiting();
  return navigator.locks.request(legacy.lock, { signal }, readAndMigrate);
}
