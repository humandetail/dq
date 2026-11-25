import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceEvents, cancelEvent, createEventQueue, scheduleEvent, secondsToMicroseconds,
} from "../src/game/event-queue.ts";

test("same-time callbacks keep enqueue order, including cancellation and zero delay", () => {
  const queue = createEventQueue();
  const seen = [];
  const due = secondsToMicroseconds(40);
  assert.equal(secondsToMicroseconds(0.0000005), 1);
  scheduleEvent(queue, due, "stop");
  const finalBatch = scheduleEvent(queue, due, "final batch");
  scheduleEvent(queue, due, "already enqueued");

  const result = advanceEvents(queue, due, 10, ({ payload }) => {
    seen.push(payload);
    if (payload === "stop") {
      assert.equal(cancelEvent(queue, finalBatch), true);
      scheduleEvent(queue, 0, "zero delay");
    }
  });

  assert.equal(result, "reached");
  assert.deepEqual(seen, ["stop", "already enqueued", "zero delay"]);
});

test("periodic timers keep their cadence and identity across sliced snapshot recovery", () => {
  const initial = createEventQueue();
  const second = secondsToMicroseconds(1);
  const timer = scheduleEvent(initial, second, "tick", second);
  scheduleEvent(initial, 2 * second, "existing tie");
  const target = secondsToMicroseconds(3.5);

  function replay(limit) {
    let queue = structuredClone(initial);
    const seen = [];
    let result;
    do {
      result = advanceEvents(queue, target, limit, ({ dueUs, payload }) => {
        seen.push([dueUs, payload]);
        if (dueUs === 3 * second) assert.equal(cancelEvent(queue, timer), true);
      });
      queue = JSON.parse(JSON.stringify(queue));
    } while (result === "pending");
    assert.equal(result, "reached");
    return { queue, seen };
  }

  const continuous = replay(10);
  assert.deepEqual(replay(1), continuous);
  assert.deepEqual(continuous.seen, [
    [second, "tick"], [2 * second, "existing tie"], [2 * second, "tick"], [3 * second, "tick"],
  ]);
  assert.equal(continuous.queue.nowUs, target);
  assert.deepEqual(continuous.queue.pending, []);
});

test("terminal dispatch stops catch-up at the event before another same-time callback", () => {
  const queue = createEventQueue();
  scheduleEvent(queue, 1, "terminal");
  scheduleEvent(queue, 1, "attack");

  const result = advanceEvents(queue, 10, 10, ({ payload }) => {
    assert.equal(payload, "terminal");
    return false;
  });

  assert.equal(result, "stopped");
  assert.equal(queue.nowUs, 1);
  assert.equal(queue.pending.length, 1);
});
