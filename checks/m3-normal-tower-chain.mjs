// R02 pre-run with initial profile, actual draw and ordinary in-match commands.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cards, towerLevels } from "../src/game/m2/content.ts";
import { creditTime, drain, enqueue, inspectBuildPlacement, newMatch } from "../src/game/m2/match.ts";
import { learnableSkills, learningLevel } from "../src/game/m2/hero.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";
import { m3ContentVersion, m3ConfigVersion } from "../src/game/m2/m3-version.ts";

const cardId = process.argv[2] ?? "i702";
const support = process.argv.includes("--support");
const seeds = support ? [79101, 79102, 79103, 79104, 79105, 79106, 79107, 79108] : [14, 47, 811, 1709, 20261124];
const policy = {
  i702: { firstLevelHasEffect: false, label: "m3-r02-sludge-1" },
  i703: { firstLevelHasEffect: true, label: "m3-r02-rock-golem-1" },
  i704: { terminalOnly: true, terminalWeapon: true, label: "m3-r02-troop-aura-1" },
  i705: { firstLevelHasEffect: true, label: "m3-r02-ogre-1" },
  i708: { firstLevelHasEffect: false, label: "m3-r02-poison-1" },
  i709: { firstLevelHasEffect: false, label: "m3-r02-skeleton-1", terminalOnly: true },
  i711: { firstLevelHasEffect: true, label: "m3-r02-corrosion-1" },
  i712: { firstLevelHasEffect: true, label: "m3-r02-shrimp-1" },
  i713: { firstLevelHasEffect: true, label: "m3-r02-water-bounce-1" },
  i714: { terminalOnly: true, terminalWeapon: true, label: "m3-r02-troop-aura-1" },
  i715: { terminalOnly: true, terminalWeapon: true, label: "m3-r02-troop-aura-1" },
  i716: { terminalOnly: true, terminalWeapon: true, label: "m3-r02-troop-aura-1" },
  i717: { terminalOnly: true, terminalWeapon: true, label: "m3-r02-troop-aura-1" },
}[cardId];
if (!policy || !cards.has(cardId)) throw new Error(`No normal tower-chain scenario for active card ${cardId}`);
if (support && !policy.terminalWeapon) throw new Error("Support follow-up is registered only for the five ordinary troop chains");
const chain = cards.get(cardId).levels.map(level => level.id);
const digest = value => createHash("sha256").update(value).digest("hex");
const source = ["src/game/m2/match.ts", "src/game/m2/content.ts", "src/game/m2/combat.ts", "src/game/m2/weapons.json"]
  .map(path => [path, digest(readFileSync(path))]);
const sites = [{ x: -288, y: -1024 }, { x: 288, y: -1024 }, { x: -288, y: -640 }, { x: 288, y: -640 }];

function run(seed) {
  const state = newMatch(`m3-r02-${cardId}-${seed}`, seed, startSeasons().seasons);
  const initialStateSha256 = digest(JSON.stringify(state));
  const initial = { gold: state.gold, lumber: state.lumber, opening: [...state.openingCandidates] };
  const opening = ["i564", "i581", "i569", "i576"].find(id => state.openingCandidates.includes(id)) ?? state.openingCandidates[0];
  const commands = [];
  const levels = [];
  const effects = {};
  let elapsedDraws = 0;
  let targetTowerId;
  function advance(ms) {
    creditTime(state, ms);
    while (state.phase === "running") {
      const event = state.queue.pending[0];
      const terminal = policy.terminalWeapon ? state.structures.find(unit => unit.id === targetTowerId) : undefined;
      if (!targetTowerId || policy.terminalWeapon && terminal?.templateId !== chain.at(-1) && terminal?.pending?.upgradeTo !== chain.at(-1)) {
        if (drain(state, 5000) !== "pending") return;
        continue;
      }
      const atUs = event?.dueUs;
      const timer = event?.payload;
      const previousHit = state.recentHits?.at(-1);
      const pending = drain(state, 1) === "pending";
      const hit = state.recentHits?.at(-1);
      if (timer?.type === "tower-spell" && timer.towerId === targetTowerId && atUs === state.queue.nowUs) {
        const tower = state.structures.find(unit => unit.id === targetTowerId);
        if (tower && !effects[tower.templateId] && cardId === "i703" && /^N07[6-8]$/.test(timer.skillId)) {
          const enemy = state.enemies.find(unit => unit.id === timer.targetId);
          if (enemy?.nativeSlow?.untilUs === atUs + 3_000_000 || enemy?.nativeSlow?.untilUs === atUs + 2_000_000) {
            effects[tower.templateId] = { atUs, skillId: timer.skillId, targetId: enemy.id, nativeSlow: { ...enemy.nativeSlow } };
          }
        }
        if (tower && !effects[tower.templateId] && cardId === "i705" && /^N0(?:89|90|91|92)$/.test(timer.skillId)) {
          const ally = state.structures.find(unit => unit.id === timer.targetId);
          if (ally?.bloodlust?.untilUs === atUs + 5_000_000) {
            effects[tower.templateId] = { atUs, skillId: timer.skillId, ally: ally.id, bloodlust: { ...ally.bloodlust } };
          }
        }
      }
      if (hit && hit !== previousHit && hit.atUs === atUs && (hit.casterId === targetTowerId || hit.ownerId === targetTowerId)) {
        const tower = state.structures.find(unit => unit.id === targetTowerId);
        const enemy = state.enemies.find(unit => unit.id === hit.targetId);
        if (tower && !effects[tower.templateId]) {
          if (policy.terminalWeapon && tower.templateId === chain.at(-1) && hit.sourceTemplate === tower.templateId &&
              (timer?.type === "weapon-fire" || timer?.type === "weapon-impact")) {
            effects[tower.templateId] = { hit, event: timer.type,
              aura: cards.get(cardId).levels.at(-1).bindings.find(binding => ["N016", "N103", "N104"].includes(binding.skillId))?.skillId };
          } else if (cardId === "i702" && timer?.type === "disease-tick" && timer.enemyId === hit.targetId) {
            effects[tower.templateId] = hit;
          } else if (cardId === "i703" && (timer?.type === "boulder-projectile" || timer?.type === "tower-spell" && timer.skillId === "N087")) {
            effects[tower.templateId] = { hit, skillId: timer.skillId };
          } else if (cardId === "i705" && timer?.type === "ogre-projectile") {
            effects[tower.templateId] = { hit, skillId: "A058", cast: tower.ogreMulticast };
          } else if (cardId === "i708" && timer?.type === "poison-tick" && timer.enemyId === hit.targetId) {
            effects[tower.templateId] = { hit, poison: enemy?.poison?.[targetTowerId] };
          } else if (cardId === "i711" && enemy?.nativeCorrosion?.untilUs === hit.atUs + 5_000_000) {
            effects[tower.templateId] = { hit, nativeCorrosion: { ...enemy.nativeCorrosion } };
          } else if (cardId === "i712" && timer?.type === "spell-sweep" && ["N108", "N109", "N110"].includes(timer.sweep.name)) {
            effects[tower.templateId] = { hit, skillId: timer.sweep.name, manaRegen: tower.manaRegen };
          } else if (cardId === "i709" && tower.templateId === "H010" && tower.hero?.ranks.A036 &&
              state.recentHits.at(-2)?.casterId === tower.id && state.recentHits.at(-2)?.atUs === atUs &&
              state.recentHits.at(-2) !== previousHit) {
            effects[tower.templateId] = { attack: hit, child: state.recentHits.at(-2), ranks: { ...tower.hero.ranks } };
          } else if (cardId === "i713" && timer?.type === "weapon-impact" && timer.shot.bounce) {
            effects[tower.templateId] = { hit, bounce: structuredClone(timer.shot.bounce), raw: timer.shot.raw };
          }
        }
      }
      if (!pending) return;
    }
  }
  function send(action) {
    const id = String(commands.length + 1);
    const atUs = state.queue.nowUs;
    const goldBefore = state.gold;
    const lumberBefore = state.lumber;
    enqueue(state, { id, matchId: state.matchId, action });
    advance(.001);
    for (let i = 0; i < 44 && state.phase === "running" && !state.commandResults[id]; i++) advance(250);
    const result = state.commandResults[id];
    const card = result?.createdId && state.cards.find(entry => entry.id === result.createdId);
    commands.push({ atUs, wave: state.wave, action, result, goldBefore, goldAfter: state.gold,
      ...(policy.terminalWeapon ? { lumberBefore, lumberAfter: state.lumber } : {}),
      ...(card ? { obtained: card.card } : {}) });
    return result;
  }
  const carried = id => state.inventory.find(item => item.itemId === id && item.slot !== null && item.towerId === undefined);
  const use = id => carried(id) && send({ type: "use-item", itemId: carried(id).id });
  function build(action) {
    const point = sites.find(point => inspectBuildPlacement(state, { ...action, point }).ok);
    if (point) return send({ ...action, point });
  }
  send({ type: "choose-talent", choice: "W005" });
  use("i004");
  const starter = send({ type: "choose-opening", card: opening });
  const heroId = starter?.ok && build({ type: "build-card", cardId: starter.createdId })?.createdId;
  if (support && heroId) {
    build({ type: "build-worker-tower", tower: "n021" });
    build({ type: "build-worker-tower", tower: "n001" });
  }
  use("i006");
  if (carried("i401")) use("i411");
  for (const item of [...state.inventory]) {
    if (item.slot === null || item.towerId !== undefined) continue;
    if (heroId && ["i131", "i133", "i262", "i104", "i170"].includes(item.itemId)) {
      const result = send({ type: "transfer-item", itemId: item.id, towerId: heroId });
      if (result?.ok) continue;
    }
    send({ type: "drop-item", itemId: item.id });
  }
  let drawAfterUs = state.queue.nowUs;
  while (state.phase === "running" && state.wave <= 25) {
    if (state.queue.nowUs >= (state.workerBenefitReadyUs ?? 0)) send({ type: "claim-worker-benefit" });
    for (const hero of state.structures.filter(unit => unit.hero && !unit.pending)) {
      const skills = learnableSkills(hero.templateId);
      const priority = hero.templateId === "H010" ? "A036" : hero.templateId === "H018" ? "A058" : undefined;
      if (priority) skills.sort((a, b) => Number(b.skillId === priority) - Number(a.skillId === priority));
      for (const skill of skills) {
        const required = learningLevel(hero.hero, hero.templateId, skill.skillId);
        if (hero.hero.points && required !== undefined && hero.hero.level >= required)
          send({ type: "learn-skill", towerId: hero.id, skillId: skill.skillId });
      }
    }
    const target = state.structures.find(unit => unit.id === targetTowerId);
    if (!target) {
      const card = state.cards.find(entry => entry.card === cardId && entry.slot !== null);
      if (card) targetTowerId = build({ type: "build-card", cardId: card.id })?.createdId;
      else if (state.gold >= (support ? 1100 : 1000) && elapsedDraws < 12 && state.queue.nowUs >= drawAfterUs) {
        if (send({ type: "draw", draw: "i001" })?.ok) elapsedDraws++;
        drawAfterUs = state.queue.nowUs + 10_000_000;
        for (const other of [...state.cards]) {
          if (other.card !== cardId && other.slot !== null) send({ type: "drop-card", cardId: other.id });
        }
      }
    } else if (!target.pending) {
      if (levels.at(-1)?.id !== target.templateId) levels.push({ id: target.templateId, atUs: state.queue.nowUs, wave: state.wave });
      const upgrade = towerLevels.get(target.templateId).upgrade;
      if (upgrade && state.gold >= upgrade.gold &&
          (policy.terminalOnly || !policy.firstLevelHasEffect && target.templateId === chain[0] || effects[target.templateId])) {
        send({ type: "upgrade-tower", towerId: target.id });
      }
      if (!upgrade && effects[target.templateId]) break;
    }
    advance(1000);
  }
  return { seed, source, initialStateSha256, initial, opening, elapsedDraws, levels, effects,
    end: { phase: state.phase, wave: state.wave, atUs: state.queue.nowUs, gold: state.gold, result: state.result },
    status: levels.length === chain.length && effects[chain.at(-1)] ? "passed" : "failed", commands };
}

const summary = { version: m3ContentVersion, configuration: m3ConfigVersion, cardId, chain,
  ...(policy.terminalWeapon ? { targetConfigSha256: digest(readFileSync("docs/m3-configuration.json")) } : {}),
  policy: support ? `${policy.label}-support` : policy.label };
const evidenceDirectory = process.env.M3_RUN_DIR;
if (evidenceDirectory) mkdirSync(evidenceDirectory, { recursive: true });
const samples = seeds.map(seed => {
  const sample = run(seed);
  if (evidenceDirectory) {
    const result = JSON.stringify({ ...summary, samples: [sample] }, null, 2) + "\n";
    writeFileSync(join(evidenceDirectory, `${cardId}-seed-${seed}.json`), result, { flag: "wx" });
  }
  return sample;
});
console.log(JSON.stringify({ ...summary, samples }, null, 2));
