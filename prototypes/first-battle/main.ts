import { advanceTime, capacity, capacityPoints, enemy, enqueueAttack, frameMs, newBattle, tower, type Snapshot } from './battle';
import { restore, save } from './save';
import { createScene } from './scene';
import { advanceClock, updateClock, type Clock } from './clock';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const buttons = ['normal', 'fast', 'background', 'reload', 'loss', 'step', 'reset']
  .map(id => byId<HTMLButtonElement>(id));
let snapshot: Snapshot = { battle: newBattle(), remainderMs: 0 };
let run: (Clock & { lastSave: number }) | undefined;
let saving = true;
let selected: string | undefined;
let scene: ReturnType<typeof createScene> | undefined;
const report = (message: string) => { byId('mode').textContent = message; };

try {
  scene = createScene(byId<HTMLCanvasElement>('view'), (id) => {
    selected = id;
    show();
  }, message => { byId('animation').textContent = message; });
} catch (error) {
  byId('asset').textContent = String(error);
}

function show() {
  const battle = snapshot.battle;
  const labels = { running: '进行中', win: '胜利', loss: '失败' };
  byId('state').textContent = [
    `逻辑帧 ${battle.frame} · ${labels[battle.result]}`,
    `容怪 ${capacityPoints(battle.units)}/${capacity} · 随机状态 ${battle.rng}`,
    `哨塔射程 ${tower.range} · 最小碰撞间距 ${tower.radius + enemy.radius}`,
    ...battle.units.map(unit => `${unit.id} · 位置 ${unit.x} · 生命 ${unit.hp}${unit.blocked ? ' · 碰撞受阻' : ''}`),
    ...battle.pending.map(event => `第 ${event.frame} 帧待执行 · ${event.startsWave ? '下一波出怪与容怪检查' : '同波出怪'}`),
  ].join('\n');
  byId('state').dataset.result = battle.result;
  byId('events').textContent = battle.log.join('\n');
  byId('snapshot').textContent = JSON.stringify(snapshot, null, 2);
  byId('selection').textContent = selected === 'tower' ? '选中 · 哨塔' : selected ? `选中 · 敌人 ${selected}` : '未选中单位';
  byId<HTMLButtonElement>('attack').disabled = saving || battle.result !== 'running' || !battle.units.some(unit => unit.id === selected);
  for (const button of buttons) button.disabled = saving || Boolean(run) && button.id !== 'reset';
  byId<HTMLButtonElement>('pause').disabled = saving || !run;
  byId<HTMLButtonElement>('speed').disabled = saving || !run;
  byId('pause').textContent = run?.paused ? '继续' : '暂停';
}

function saveCurrent() {
  const current = snapshot;
  const captured = run ? { ...snapshot, speed: run.speed, paused: run.paused } : snapshot;
  return save(captured).catch(error => {
    if (snapshot === current) report(`存档失败 · ${error}`);
  });
}

function reset(firstAttack = true) {
  run = undefined;
  snapshot = { battle: newBattle(firstAttack), remainderMs: 0 };
  selected = undefined;
  scene?.idle();
  show();
}

function progress(elapsed: number, speed: number) {
  const frame = snapshot.battle.frame;
  const before = snapshot.battle.result;
  if (advanceTime(snapshot, elapsed, speed)) scene?.attack();
  if (snapshot.battle.frame === frame) return;
  if (snapshot.battle.result !== before) void saveCurrent();
  show();
}

function start(speed: number, label: string, paused = false) {
  const now = performance.now();
  run = { speed, last: now, lastSave: now, paused };
  report(label);
  show();
}

function tick(now: number) {
  if (run && !document.hidden) {
    const frame = snapshot.battle.frame;
    if (advanceClock(snapshot, run, now)) scene?.attack();
    if (snapshot.battle.frame !== frame) show();
    if (snapshot.battle.result !== 'running') {
      run = undefined;
      void saveCurrent();
      show();
    } else if (now - run.lastSave >= 5000) {
      run.lastSave = now;
      void saveCurrent();
    }
  }
  scene?.draw(snapshot.battle, selected, now);
  requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (run) void saveCurrent();
  } else if (run) {
    // The next tick uses elapsed time since the last visible frame.
    report('后台恢复 · 正在补算');
  }
});

window.addEventListener('beforeunload', event => {
  if (run && snapshot.battle.result === 'running') {
    event.preventDefault();
    event.returnValue = true;
  }
});

const on = (id: string, callback: () => void) => byId(id).addEventListener('click', callback);
on('normal', () => { reset(); start(1, '1× 连续运行'); });
on('fast', () => { reset(); start(4, '4× 连续运行'); });
on('background', () => {
  reset();
  progress(2 * frameMs, 1);
  report('模拟后台恢复 · 一次补算剩余时间');
  progress(6 * frameMs, 1);
});
on('reload', async () => {
  reset();
  progress(frameMs, 1);
  saving = true;
  show();
  try {
    if (await save(snapshot) !== 'saved') throw new Error('快照请求已被替换');
    location.reload();
  } catch (error) {
    saving = false;
    report(`存档失败 · ${error}`);
    show();
  }
});
on('loss', () => { reset(false); start(4, '反例 · 下一波前未清怪'); });
on('step', () => { report('手动推进一帧'); progress(frameMs, 1); });
on('reset', () => { reset(); report('等待运行'); void saveCurrent(); });
on('pause', () => {
  if (!run) return;
  if (updateClock(snapshot, run, performance.now(), run.speed, !run.paused)) scene?.attack();
  show();
  void saveCurrent();
});
on('speed', () => {
  if (!run) return;
  const speed = run.speed === 1 ? 4 : 1;
  if (updateClock(snapshot, run, performance.now(), speed, run.paused)) scene?.attack();
  report(`${speed}× 连续运行`);
  show();
  void saveCurrent();
});
on('attack', () => {
  if (!selected || selected === 'tower') return;
  enqueueAttack(snapshot.battle, selected);
  void saveCurrent();
  report(`攻击指令已排入第 ${snapshot.battle.frame + 1} 帧`);
  show();
});
on('swap', () => { byId('asset').textContent = scene?.swap() ? '显示四糸乃' : '显示替换几何模型'; });
on('animate', () => scene?.attack());
byId<HTMLInputElement>('files').addEventListener('change', async event => {
  const input = event.currentTarget as HTMLInputElement;
  if (!scene || !input.files?.length) return;
  try {
    const result = await scene.load([...input.files]);
    byId('asset').textContent = result;
    byId<HTMLButtonElement>('swap').disabled = false;
    byId<HTMLButtonElement>('animate').disabled = false;
  } catch (error) {
    byId('asset').textContent = String(error);
  }
});

show();
requestAnimationFrame(tick);

async function resumeAfterReload() {
  try {
    const restored = await restore();
    if (!restored) return;
    snapshot = restored;
    const label = `从 IndexedDB 第 ${snapshot.battle.frame} 帧续局`;
    if (snapshot.battle.result === 'running' && snapshot.battle.frame > 0) {
      start(snapshot.speed ?? 1, label, snapshot.paused ?? false);
    } else report(label);
  } catch (error) {
    report(`续局失败 · ${error}`);
  } finally {
    saving = false;
    show();
  }
}

void resumeAfterReload();
