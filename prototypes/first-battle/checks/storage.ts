import { advanceFrame, enqueueEconomy, enterEndless, newSession, type Snapshot } from '../battle';
import { createSaveStore } from '../save';

const result = document.querySelector<HTMLPreElement>('#result')!;
const name = 'td3-first-battle-storage-check';
const store = createSaveStore(name);
const make = (id: string): Snapshot => ({ battle: newSession(id), remainderMs: 0 });
const originalPut = IDBObjectStore.prototype.put;

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function aborted(snapshot: Snapshot) {
  try {
    await store.save(snapshot);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    throw error;
  }
  throw new Error('Expected an actual IndexedDB abort');
}

IDBObjectStore.prototype.put = function (...args: Parameters<typeof originalPut>) {
  const request = originalPut.apply(this, args);
  const record = args[0] as { snapshot?: Snapshot };
  if (this.transaction.db.name === name && record.snapshot?.battle.session?.id === 'abort') {
    request.addEventListener('success', () => this.transaction.abort(), { once: true });
  }
  return request;
};

try {
  const baseline = make('A');
  equal(await store.save(baseline), 'saved');
  await aborted(make('abort'));
  equal(await store.restore(), baseline);
  result.textContent = 'A 提交后检查 B 事务中止，恢复 A。\n';

  const active = store.save(make('active'));
  const skipped = store.save(make('B'));
  const latest = make('C');
  const latestWrite = store.save(latest);
  equal(await Promise.all([active, skipped, latestWrite]), ['saved', 'superseded', 'saved']);
  equal(await store.restore(), latest);
  await aborted(make('abort'));
  equal(await store.restore(), latest);
  const retried = make('D');
  equal(await store.save(retried), 'saved');
  equal(await store.restore(), retried);
  result.textContent += '连续保存合并 B/C，中止后仍可提交 D。\n';

  const entering = make('transition');
  while (entering.battle.result === 'running') advanceFrame(entering.battle);
  await store.save(entering);
  const waiting = await store.restore();
  equal(waiting, entering);
  equal(enterEndless(entering.battle), true);
  await store.save(entering);
  const inEndless = await store.restore();
  equal(inEndless, entering);
  equal(enterEndless(inEndless!.battle), false);

  advanceFrame(entering.battle);
  enqueueEconomy(entering.battle, { id: 'pending-purchase', kind: 'buy', frame: entering.battle.frame + 1 });
  entering.battle.pending.push({ frame: entering.battle.frame + 1, type: 'spawn', x: 1, hp: 1 });
  equal(entering.battle.units.length, 1);
  equal(entering.battle.attackReadyAt, entering.battle.frame + 1);
  await store.save(entering);
  const activeWave = (await store.restore())!;
  for (let frame = 0; frame < 30 && activeWave.battle.result === 'running'; frame++) {
    advanceFrame(entering.battle);
    advanceFrame(activeWave.battle);
    equal(activeWave, entering);
  }
  equal([activeWave.battle.session!.lastWave, activeWave.battle.result], [5, 'loss']);
  await store.save(activeWave);
  const terminal = (await store.restore())!;
  advanceFrame(terminal.battle);
  equal(terminal, activeWave);

  const oldWrite = store.save(entering);
  const oldPending = store.save(entering);
  const restarted = make('restart');
  const restartWrite = store.save(restarted);
  equal(await Promise.all([oldWrite, oldPending, restartWrite]), ['saved', 'superseded', 'saved']);
  equal(await store.restore(), restarted);
  result.textContent += '主线等待、无尽波中、失败终态和旧事务未结束时重开，均恢复正确快照。';
  result.dataset.status = 'passed';
} catch (error) {
  result.textContent = String(error);
  result.dataset.status = 'failed';
  throw error;
} finally {
  IDBObjectStore.prototype.put = originalPut;
}
