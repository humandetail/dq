type TimedEvent<Payload> = {
  timerId: number;
  sequence: number;
  dueUs: number;
  periodUs: number;
  payload: Payload;
};

export type EventQueue<Payload> = {
  nowUs: number;
  nextSequence: number;
  pending: TimedEvent<Payload>[];
};

export function createEventQueue<Payload>(): EventQueue<Payload> {
  return { nowUs: 0, nextSequence: 1, pending: [] };
}

function requireInteger(value: number, minimum: number) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`Expected a safe integer >= ${minimum}, received ${value}`);
  }
  return value;
}

export function secondsToMicroseconds(seconds: number) {
  if (seconds < 0) throw new RangeError("Battle time cannot be negative");
  return requireInteger(Math.round(seconds * 1_000_000), 0);
}

function insert<Payload>(queue: EventQueue<Payload>, event: TimedEvent<Payload>) {
  const events = queue.pending;
  let start = 0;
  let end = events.length;
  // New sequences always follow existing events at the same time.
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (events[middle].dueUs <= event.dueUs) start = middle + 1;
    else end = middle;
  }
  events.splice(start, 0, event);
}

export function scheduleEvent<Payload>(
  queue: EventQueue<Payload>, delayUs: number, payload: Payload, periodUs = 0,
) {
  const dueUs = requireInteger(queue.nowUs + requireInteger(delayUs, 0), 0);
  requireInteger(periodUs, 0);
  const timerId = queue.nextSequence++;
  insert(queue, { timerId, sequence: timerId, dueUs, periodUs, payload });
  return timerId;
}

export function cancelEvent<Payload>(queue: EventQueue<Payload>, timerId: number) {
  const index = queue.pending.findIndex(event => event.timerId === timerId);
  if (index < 0) return false;
  queue.pending.splice(index, 1);
  return true;
}

// A slice can stop between events at the same time. Resume with the same target
// before submitting new inputs. A yielded dispatch owns its continuation. A false
// return stops at the current event.
export function advanceEvents<Payload>(
  queue: EventQueue<Payload>, targetUs: number, limit: number,
  dispatch: (event: Readonly<TimedEvent<Payload>>) => void | false | "yield",
  shouldYield?: () => boolean,
): "reached" | "pending" | "stopped" {
  requireInteger(targetUs, queue.nowUs);
  requireInteger(limit, 1);
  for (let processed = 0; queue.pending[0]?.dueUs <= targetUs; processed++) {
    if (processed === limit || (processed > 0 && shouldYield?.())) return "pending";
    const event = queue.pending[0];
    const nextDueUs = requireInteger(event.dueUs + event.periodUs, 0);
    queue.pending.shift();
    queue.nowUs = event.dueUs;
    // Register the next occurrence so callbacks can cancel their own timer.
    if (event.periodUs > 0) {
      insert(queue, { ...event, dueUs: nextDueUs, sequence: queue.nextSequence++ });
    }
    const result = dispatch(event);
    if (result === false) return "stopped";
    if (result === "yield") return "pending";
  }
  queue.nowUs = targetUs;
  return "reached";
}
