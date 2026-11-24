// Injected by Chrome DevTools before the measurement-only production build starts.
(() => {
  const config = globalThis.desktopAuditConfig;
  const sites = ["west", "east", "north", "south"];
  const rows = [];
  const frameCosts = [];
  const capture = [];
  const commits = [];
  const drawCosts = [];
  const errors = [];
  let start;
  let firstFrame;
  let nextFrame;
  let pending;
  let maxPending = 0;
  let highLoadFrames = 0;
  let renderedFrames = 0;
  let lastPhoto;
  let end;
  let done = false;

  function quantile(values) {
    const sorted = values.toSorted((a, b) => a - b);
    return [0.95, 0.99].map(q => sorted[Math.ceil(q * sorted.length) - 1] ?? null);
  }

  globalThis.desktopAudit = {
    saving: config.mode === "on",
    queued({ id, targetFrame }) {
      if (!pending) return;
      Object.assign(pending, { id, targetFrame, confirmationMs: performance.now() - pending.at,
        confirmation: document.querySelector("#feedback").textContent });
    },
    settled(result, frame) {
      if (!pending || pending.id !== result.id) return;
      Object.assign(pending, { frame, resultMs: performance.now() - pending.at, success: result.ok,
        feedback: document.querySelector("#feedback").textContent });
      delete pending.at;
      rows.push(pending);
      pending = undefined;
    },
    frame: ms => { if (start !== undefined && !done) frameCosts.push(ms); },
    capture: ms => { if (start !== undefined && !done) capture.push(ms); },
    committed: ms => { if (start !== undefined && !done) commits.push(ms); },
    draw: ms => { if (start !== undefined && !done) { drawCosts.push(ms); renderedFrames++; } },
    update(snapshot, pendingBeforeDrain) {
      if (done) return;
      const now = performance.now();
      if (start === undefined) {
        start = now;
        firstFrame = snapshot.state.frame;
        nextFrame = firstFrame + 50;
      }
      const state = snapshot.state;
      maxPending = Math.max(maxPending, pendingBeforeDrain);
      if (state.towers.length === 4 && state.enemies.length === 23) highLoadFrames++;
      end ??= now >= start + config.seconds * 1000 ? now : undefined;
      const expected = Math.floor((config.seconds * 40 - 20) / 50);
      if (rows.length < expected && !pending && state.frame >= nextFrame) {
        const site = sites[rows.length % sites.length];
        document.querySelector(`#sites button[data-site="${site}"]`)?.click();
        const skill = document.querySelector("#overcharge");
        if (!skill || skill.hidden || skill.disabled) {
          errors.push("skill disabled at frame " + state.frame + " " + site);
        } else {
          pending = { at: performance.now(), site, requestedFrame: nextFrame };
          skill.click();
          if (!pending.id) { errors.push("input not queued"); pending = undefined; }
        }
        nextFrame += 50;
      }
      globalThis.desktopAuditProgress = { frames: state.frame, inputs: rows.length, renderedFrames, pending: pendingBeforeDrain };
      if (end === undefined || (pending || rows.length < expected) && now < end + 10000) return;
      done = true;
      if (!document.querySelector("#battlefield")?.getContext("webgl2")) errors.push("missing WebGL2");
      if (rows.length !== expected || rows.some(row => !row.success || row.confirmation !== "已接收：过载" || row.feedback !== "过载成功")) {
        errors.push("missing confirmations or settlements");
      }
      lastPhoto = JSON.parse(JSON.stringify(snapshot));
      globalThis.desktopAuditResult = {
        mode: config.mode, viewport: [innerWidth, innerHeight], chrome: navigator.userAgent,
        firstFrame, elapsedMs: end - start, finalFrame: state.frame, highLoadFrames,
        renderedFrames, maxPending, captureCount: capture.length, completedCommits: commits.length,
        snapshotBytes: new TextEncoder().encode(JSON.stringify(lastPhoto)).length,
        milliseconds: { confirmation: quantile(rows.map(row => row.confirmationMs)), logic: quantile(rows.map(row => row.resultMs)),
          logicFrame: quantile(frameCosts), snapshotCapture: quantile(capture), saveIncludingCapture: quantile(commits), sceneDraw: quantile(drawCosts) },
        rows, finalState: lastPhoto.state, errors
      };
    }
  };
})();
