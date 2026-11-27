// Observe unlabelled deliveries in previously completed ordinary runs.
// The archived commands, timing and starting state are left unchanged.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { containmentPoints, creditTime, drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { mapVersion } from "../src/game/m2/map.ts";
import { m3ConfigVersion, m3ContentVersion } from "../src/game/m2/m3-version.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";

const [manifestPath, outputPath] = process.argv.slice(2);
assert.ok(manifestPath && outputPath, "Pass the fixed archive manifest and a new output directory");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sha256 = data => createHash("sha256").update(data).digest("hex");
const configSha256 = sha256(await readFile(new URL("../docs/m2-configuration.json", import.meta.url)));
const targetConfigSha256 = sha256(await readFile(new URL("../docs/m3-configuration.json", import.meta.url)));
await mkdir(outputPath);
const summary = { kind: "serial-observation-of-normal-archives", configSha256, targetConfigSha256, runs: [] };

for (const entry of manifest.archives) {
  const archivePath = resolve(dirname(manifestPath), entry.path);
  const run = { seed: entry.seed, archivePath, receiptsVerified: 0, seenCards: [] };
  let twoWisps;
  try {
    const evidence = JSON.parse(await readFile(archivePath, "utf8"));
    const record = evidence.runs.find(candidate => candidate.seed === entry.seed);
    assert.equal(evidence.kind, "normal-engine-source");
    assert.equal(evidence.contentVersion, m3ContentVersion);
    assert.equal(evidence.configurationVersion, m3ConfigVersion);
    assert.equal(evidence.mapVersion, mapVersion);
    assert.equal(evidence.configSha256, configSha256);
    assert.equal(evidence.targetConfigSha256, targetConfigSha256);
    assert.ok(record.result && record.wave >= 52);
    assert.equal(record.inputLogSha256, entry.inputLogSha256);
    assert.equal(sha256(JSON.stringify(record.inputs)), entry.inputLogSha256);
    const account = startSeasons();
    const match = newMatch(`normal-${entry.seed}`, entry.seed, account.seasons);
    if (record.seasonEvidence) match.startingScore = account.score;
    assert.deepEqual(match.openingCandidates, record.candidates);
    assert.equal(sha256(JSON.stringify(match)), record.initialStateSha256);

    function inspect(nextInput) {
      const wisps = match.cards.filter(card => card.card === "i571" && card.charges > 0);
      for (const card of wisps) {
        if (!run.seenCards.some(seen => seen.id === card.id)) run.seenCards.push({ id: card.id, slot: card.slot,
          point: { ...card.point }, atUs: match.queue.nowUs, wave: match.wave, nextInput });
      }
      if (wisps.length < 2 || twoWisps || match.phase !== "running") return;
      const snapshot = JSON.parse(JSON.stringify(match));
      twoWisps = { kind: "verified-normal-wisp-pair-checkpoint", seed: entry.seed, archivePath, nextInput,
        inputLogSha256: record.inputLogSha256, snapshotSha256: sha256(JSON.stringify(snapshot)),
        contentVersion: m3ContentVersion, configVersion: m3ConfigVersion, mapVersion,
        atUs: match.queue.nowUs, wave: match.wave, cards: wisps.map(card => card.id),
        gold: match.gold, lumber: match.lumber, population: match.population, populationLimit: match.populationLimit,
        containment: containmentPoints(match), snapshot };
    }

    function advance(atUs) {
      if (atUs <= match.queue.nowUs || match.phase !== "running") return;
      creditTime(match, (atUs - match.queue.nowUs) / 1000);
      while (drain(match, 10_000) === "pending") {}
    }

    for (const [index, command] of record.inputs.entries()) {
      run.nextInput = index + 1;
      advance(command.atUs);
      assert.equal(match.queue.nowUs, command.atUs);
      inspect(index);
      assert.ok(enqueue(match, { id: String(index + 1), matchId: match.matchId, action: command.action }));
    }
    advance(record.result.atUs);
    inspect(record.inputs.length);
    for (const [index, command] of record.inputs.entries()) {
      run.nextReceipt = index + 1;
      assert.deepEqual(match.commandResults[String(index + 1)], command.outcome);
      run.receiptsVerified++;
    }
    assert.deepEqual(match.result, record.result);
    assert.deepEqual(JSON.parse(JSON.stringify(match.finalHit ?? null)), record.finalHit);
    assert.equal(match.kills ?? 0, record.kills);
    assert.equal(match.wave, record.wave);
    assert.deepEqual({ gold: match.gold, lumber: match.lumber }, record.capital);
    run.result = match.result;
    if (twoWisps) {
      run.pairCheckpoint = join(outputPath, `pair-${entry.seed}.json`);
      await writeFile(run.pairCheckpoint, JSON.stringify(twoWisps, null, 2) + "\n", { flag: "wx" });
    }
    run.status = twoWisps ? "verified-pair" : "matched-without-pair";
  } catch (error) {
    run.status = "not-matched";
    run.error = { message: error.message, actual: error.actual, expected: error.expected, stack: error.stack };
    delete run.pairCheckpoint;
  }
  await writeFile(join(outputPath, `seed-${entry.seed}.json`), JSON.stringify(run, null, 2) + "\n", { flag: "wx" });
  summary.runs.push(run);
  console.log(JSON.stringify({ seed: entry.seed, status: run.status, seen: run.seenCards.length, receipts: run.receiptsVerified }));
}
await writeFile(join(outputPath, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
