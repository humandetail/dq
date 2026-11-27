// Real starter pack, actual four-card offer and persisted initial score; no resource injections.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { creditTime, drain, enqueue, inspectBuildPlacement, newMatch, spendableScore } from "../src/game/m2/match.ts";
import { seasonDefinitions, startSeasons } from "../src/game/m2/seasons.ts";
import { m3ContentVersion, m3ConfigVersion } from "../src/game/m2/m3-version.ts";

const seeds = [14, 47, 811, 1709, 20261124];
const exchangeOrder = ["i549", "i548", "i547", "i545", "i550", "i546"];
const fingerprint = value => createHash("sha256").update(value).digest("hex");
const source = ["src/game/m2/match.ts", "src/game/m2/hero-exchange.ts", "src/game/m2/content.ts", "docs/m3-configuration.json"]
  .map(path => [path, fingerprint(readFileSync(path))]);

const replayPath = process.argv.slice(2).find(value => value !== "--all");
const allInheritedOffers = process.argv.includes("--all");
const replay = replayPath && JSON.parse(readFileSync(replayPath));
const terminal = replay?.runs[0];
if (terminal) {
  assert.equal(terminal.status, "replay-matched");
  assert.equal(terminal.result.reason, "timeout");
  assert.equal(terminal.settlementEvidence.killScore, Math.floor(terminal.kills * 2.5 / 100));
}

function inheritedProfile() {
  const seasons = structuredClone(terminal.seasonProgress);
  let score = terminal.settlementEvidence.killScore;
  for (const [season, progress] of Object.entries(seasons)) {
    for (const node of progress.nodes) {
      const reward = seasonDefinitions[season].rewards[node];
      if (reward["1"] === 1) score += reward["3"];
    }
  }
  return { seasons, score };
}

function exercise(seed, offer) {
  const initial = terminal ? inheritedProfile() : startSeasons();
  const state = newMatch(`m3-r03-${offer}-${seed}`, seed, initial.seasons);
  state.startingScore = initial.score;
  const initialSha256 = fingerprint(JSON.stringify(state));
  const commands = [];
  function advance(ms) {
    creditTime(state, ms);
    while (drain(state, 1000) === "pending") {}
  }
  function send(action) {
    const id = String(commands.length + 1);
    const before = { score: spendableScore(state), atUs: state.queue.nowUs,
      cardIds: state.cards.map(entry => entry.id), spring9: state.seasons.spring.counts[9] };
    if (!enqueue(state, { id, matchId: state.matchId, action })) return;
    advance(.001);
    for (let retry = 0; retry < 44 && !state.commandResults[id] && state.phase === "running"; retry++) advance(250);
    const result = state.commandResults[id];
    commands.push({ action, result, before, after: { score: spendableScore(state),
      cardIds: state.cards.map(entry => entry.id), spring9: state.seasons.spring.counts[9] } });
    return result;
  }
  const starter = state.inventory.find(entry => entry.itemId === "i004");
  send({ type: "use-item", itemId: starter.id });
  const starterCard = state.openingCandidates[0];
  const choice = send({ type: "choose-opening", card: starterCard });
  const action = { type: "exchange-hero", offer };
  const first = send(action);
  const success = commands.at(-1);
  const repeat = first?.ok ? send(action) : null;
  const scoreOffers = ["i550", "i546"];
  const sharedScore = first?.ok && scoreOffers.includes(offer) ?
    send({ type: "exchange-hero", offer: scoreOffers.find(value => offer !== value) }) : null;
  const consumedCards = success.before.cardIds.filter(id => !success.after.cardIds.includes(id));
  const debit = offer === "i550" ? 60 : offer === "i546" ? 100 : 0;
  const transaction = first?.ok && consumedCards.length === 1 && consumedCards[0] === choice.createdId &&
    success.before.score - success.after.score === debit && (success.after.spring9 ?? 0) === (success.before.spring9 ?? 0) + 1 &&
    (!sharedScore || sharedScore.reason === "stock");
  const received = first?.ok && state.cards.find(entry => entry.id === first.createdId);
  let built;
  if (received) {
    const build = { type: "build-card", cardId: received.id, point: { x: -288, y: -160 } };
    if (inspectBuildPlacement(state, build).ok) {
      const placement = send(build);
      advance(3000);
      built = state.structures.find(entry => entry.id === placement?.createdId && !entry.pending)?.templateId;
    }
  }
  const doom = built === "H042" && state.structures.find(entry => entry.templateId === built);
  if (doom) send({ type: "learn-skill", towerId: doom.id, skillId: "A164" });
  return { seed, offer, initialSha256, candidates: state.openingCandidates, starterCard, received, built, first, repeat, sharedScore, consumedCards, commands,
    ...(doom && { learnedA164: doom.hero.ranks.A164, grantedT329: doom.hero.ranks.T329 }),
    status: transaction && repeat?.reason === "stock" && built && received.card === (offer === "i546" ? "i506" : offer) ? "passed" : offer === "i546" && first?.reason === "resources" ? "requires-ordinary-score" : "partial" };
}

console.log(JSON.stringify({ content: m3ContentVersion, configuration: m3ConfigVersion,
  policy: terminal ? allInheritedOffers ? "m3-r03-inherited-all-1" : "m3-r03-inherited-1" : "m3-r03-opening-1", source,
  ...(terminal && { priorMatch: { seed: terminal.seed, result: terminal.result, kills: terminal.kills,
    earnedScore: terminal.settlementEvidence.killScore, evidenceSha256: fingerprint(readFileSync(replayPath)) } }),
  samples: (terminal && !allInheritedOffers ? ["i546"] : exchangeOrder).flatMap(offer => seeds.map(seed => exercise(seed, offer))) }, null, 2));
