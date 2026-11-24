import { advanceFrame, enqueue, newMatch } from "../src/game/battle.ts";
import { newClock } from "../src/game/clock.ts";
import { contentVersion, map } from "../src/game/content.ts";
import { saveFormatVersion } from "../src/game/state.ts";

const seed = 1337;
export function makeDesktopFixture() {
  const state = newMatch("v1", seed);
  Object.assign(state, { mode: "endless", phase: "endless", events: [], gold: 2000, currentWave: 1,
    waves: [{ number: 1, remainingBatches: 0, livingEnemies: 23 }] });
  for (const site of Object.keys(map.buildSites)) {
    const cardId = state.nextInstanceId++;
    state.cards.push({ id: cardId, tower: "beacon" });
    enqueue(state, { matchId: state.matchId, id: "build-" + site, action: { type: "build", site, cardId } });
  }
  advanceFrame(state);
  for (const tower of state.towers) {
    tower.level = 2;
    state.items.push({ id: state.nextInstanceId++, type: "amplifier", owner: { type: "tower", id: tower.id } });
  }
  for (let index = 0; index < 23; index++) {
    const position = { x: -5.7 + (index % 12) * 0.95, y: 3.8 - Math.floor(index / 12) * 0.8 };
    state.enemies.push({ id: state.nextInstanceId++, type: "skimmer", wave: 1, position, nextWaypoint: 1, hp: 1e9 });
  }
  return { formatVersion: saveFormatVersion, contentVersion, revision: 0, state, clock: { ...newClock(), speed: 4 } };
}
