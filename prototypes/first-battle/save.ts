import type { Snapshot } from './battle';

type Saved = { version: 2; snapshot: Snapshot };
type Job = { record: Saved; resolve: (status: 'saved' | 'superseded') => void; reject: (error: unknown) => void };

export function createSaveStore(name = 'td3-first-battle-prototype') {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('runs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let active = false;
  let pending: Job | undefined;

  async function write(job: Job) {
    active = true;
    try {
      const db = await database;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('runs', 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new DOMException('Save aborted', 'AbortError'));
        transaction.objectStore('runs').put(job.record, 'current');
      });
      job.resolve('saved');
    } catch (error) {
      job.reject(error);
    } finally {
      active = false;
      const next = pending;
      pending = undefined;
      if (next) void write(next);
    }
  }

  function save(snapshot: Snapshot) {
    const record: Saved = { version: 2, snapshot: structuredClone(snapshot) };
    return new Promise<'saved' | 'superseded'>((resolve, reject) => {
      const job = { record, resolve, reject };
      if (!active) {
        void write(job);
      } else {
        pending?.resolve('superseded');
        pending = job;
      }
    });
  }

  async function restore() {
    const db = await database;
    return new Promise<Snapshot | undefined>((resolve, reject) => {
      const request = db.transaction('runs').objectStore('runs').get('current');
      request.onsuccess = () => {
        const record = request.result as Saved | undefined;
        if (record && record.version !== 2) {
          reject(new Error('原型存档格式不兼容，请重置后开启新局'));
          return;
        }
        resolve(record?.snapshot);
      };
      request.onerror = () => reject(request.error);
    });
  }

  return { save, restore };
}

export const { save, restore } = createSaveStore();
