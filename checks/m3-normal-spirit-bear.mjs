// R02 normal source and staged ranks. Records every registered seed.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { creditTime, drain, enqueue, inspectBuildPlacement, newMatch } from "../src/game/m2/match.ts";
import { learningLevel } from "../src/game/m2/hero.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { m3ContentVersion, m3ConfigVersion } from "../src/game/m2/m3-version.ts";

const seeds = [14, 47, 811, 1709, 20261124];
const digest = value => createHash("sha256").update(value).digest("hex");
const source = ["src/game/m2/match.ts", "src/game/m2/hero-spells.ts", "src/game/m2/content.ts",
  "src/game/m2/weapons.json", "docs/m3-configuration.json"].map(path => [path, digest(readFileSync(path))]);

function exercise(seed) {
  const initial = startSeasons();
  const state = newMatch(`m3-normal-spirit-bear-${seed}`, seed, initial.seasons);
  state.startingScore = initial.score;
  const initialStateSha256 = digest(JSON.stringify(state));
  const commands = [];
  const bears = new Map();
  const forms = new Set();
  function advance(ms) {
    creditTime(state, ms);
    while (drain(state, 1000) === "pending") {}
  }
  function send(action) {
    const id = String(commands.length + 1);
    const atUs = state.queue.nowUs;
    if (!enqueue(state, { id, matchId: state.matchId, action })) return;
    advance(.001);
    for (let retry = 0; retry < 44 && state.phase === "running" && !state.commandResults[id]; retry++) advance(250);
    const result = state.commandResults[id];
    commands.push({ atUs, wave: state.wave, action, result });
    return result;
  }
  function use(itemId) {
    const item = state.inventory.find(entry => entry.itemId === itemId && entry.slot !== null && entry.towerId === undefined);
    if (item) send({ type: "use-item", itemId: item.id });
  }
  function build(action, point) {
    if (inspectBuildPlacement(state, { ...action, point }).ok) return send({ ...action, point });
  }
  send({ type: "choose-talent", choice: "W005" });
  use("i004");
  const opening = state.openingCandidates.includes("i574") ? "i574" : state.openingCandidates[0];
  const choice = send({ type: "choose-opening", card: opening });
  if (opening !== "i574" || !choice?.ok) {
    return { seed, initialStateSha256, opening, candidates: state.openingCandidates, commands, status: "candidate-not-offered" };
  }
  const heroId = build({ type: "build-card", cardId: choice.createdId }, { x: -288, y: -1024 })?.createdId;
  if (heroId) {
    build({ type: "build-worker-tower", tower: "n021" }, { x: 288, y: -1024 });
    build({ type: "build-worker-tower", tower: "n001" }, { x: -288, y: -640 });
    use("i006");
    use("i411");
  }
  let frenzy = false;
  let roar = false;
  let ensnare = false;
  let bearHit = false;
  let keptPrior = false;
  let recall = false;
  let itemTransferId;
  let purchaseAttempted = false;
  let replacementCarriesItem = false;
  while (heroId && state.phase === "running" && state.wave <= 18) {
    const tower = state.structures.find(unit => unit.id === heroId && !unit.pending);
    if (tower?.hero) {
      forms.add(tower.templateId);
      const bear = state.summons?.find(unit => unit.id === tower.spiritBear?.id);
      if (bear) {
        const entry = bears.get(bear.id) ?? { templateId: bear.templateId, seenUs: state.queue.nowUs, firstInherited: 0 };
        if (!entry.firstInherited) entry.firstInherited = bear.bear.inheritedAttack;
        bears.set(bear.id, entry);
        frenzy ||= tower.bearFrenzy?.unitId === bear.id;
        roar ||= state.enemies.some(enemy => enemy.bearRoarUntilUs !== undefined);
        ensnare ||= state.enemies.some(enemy => enemy.bearRootUntilUs !== undefined);
        bearHit ||= (state.recentHits ?? []).some(hit => hit.casterId === bear.id && hit.ownerId === tower.id);
        replacementCarriesItem ||= bears.size > 1 && state.inventory.some(item => item.towerId === bear.id && item.id === itemTransferId);
        if (!purchaseAttempted && state.wave >= 1) {
          purchaseAttempted = !!send({ type: "buy-item", itemId: "i101" })?.ok;
        }
        if (!itemTransferId) {
          const gear = state.inventory.find(item => item.slot !== null && item.towerId === undefined && item.itemId === "i101");
          if (gear && send({ type: "transfer-item", towerId: bear.id, itemId: gear.id })?.ok) itemTransferId = gear.id;
        }
        if (!roar && bear.templateId === "n257" && state.queue.nowUs >= Math.max(bear.heroCastUntilUs ?? 0,
            bear.towerSpellReady?.N140 ?? 0) && state.enemies.some(enemy => enemy.layer === "ground" &&
              (enemy.x - bear.x) ** 2 + (enemy.y - bear.y) ** 2 <= 500 ** 2)) {
          send({ type: "cast-tower", towerId: bear.id, skillId: "N140" });
        }
      }
      for (const skillId of ["A125", "A127", "A126"]) {
        const rank = tower.hero.ranks[skillId] ?? 0;
        const limit = skillId === "A125" ? 3 : 1;
        const required = learningLevel(tower.hero, tower.templateId, skillId);
        if (!tower.hero.points || rank >= limit || required === undefined || tower.hero.level < required) continue;
        if (send({ type: "learn-skill", towerId: tower.id, skillId })?.ok && skillId === "A125" && bear) {
          keptPrior ||= tower.spiritBear.id === bear.id;
        }
      }
      if (state.queue.nowUs >= Math.max(tower.heroCastUntilUs ?? 0, tower.stunnedUntilUs ?? 0)) {
        if (tower.hero.ranks.A125 && (!bear || Number(bear.templateId.slice(1)) - 254 < tower.hero.ranks.A125) &&
            state.queue.nowUs >= (tower.heroSpellReady?.A125 ?? 0) && (tower.mana ?? 1000) >= 50) {
          send({ type: "cast-hero", towerId: tower.id, skillId: "A125" });
        } else if (!forms.has("E016") && tower.hero.ranks.A127) {
          send({ type: "cast-hero", towerId: tower.id, skillId: "A127" });
        }
      }
      if (bear && !recall && bear.templateId !== "n255" && state.queue.nowUs >= (bear.heroCastUntilUs ?? 0)) {
        recall = !!send({ type: "cast-tower", towerId: bear.id, skillId: "N138" })?.ok;
      }
      if (bears.size >= 2 && [...bears.values()].some(entry => entry.templateId === "n257") &&
          forms.has("E016") && keptPrior && frenzy && bearHit && ensnare && roar && recall) break;
    }
    advance(250);
  }
  return { seed, initialStateSha256, opening, candidates: state.openingCandidates, heroId, forms: [...forms], bears: [...bears],
    effects: { frenzy, roar, ensnare, bearHit, keptPrior, recall, itemTransferId, replacementCarriesItem }, commands,
    end: { phase: state.phase, wave: state.wave, atUs: state.queue.nowUs },
    status: forms.has("E016") && bears.size >= 2 && keptPrior && frenzy && bearHit && ensnare && roar && recall ? "passed" : "partial" };
}
console.log(JSON.stringify({ content: m3ContentVersion, configuration: m3ConfigVersion,
  policy: "m3-r02-spirit-bear-2", source, samples: seeds.map(exercise) }, null, 2));
