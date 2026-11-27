import waveSource from "../../../docs/rules/waves-data.json" with { type: "json" };
import boundaries from "../../../docs/rules/web-wave-boundaries.json" with { type: "json" };
import pathing from "../../../docs/rules/pathing-and-placement.json" with { type: "json" };
import enemyRules from "../../../docs/rules/enemy-ability-coverage.json" with { type: "json" };
import { secondsToMicroseconds as us } from "../event-queue.ts";

export const gameStartUs = us(5);
const multiplier = waveSource.difficultyHpAndManaMultipliers[1];
const mobility = new Map(pathing.mainMnnnAndEndlessMobilityObjects.map(row => [row.unitId, row]));
const templates = new Map(Object.entries(enemyRules.templates));
export const enemyTemplateAbilities = (id: string) => templates.get(id)?.abilities ?? [];

export const waves = waveSource.waves.map(wave => {
  const boundary = boundaries.mainline[wave.wave - 1];
  if (wave.wave < 55 && boundary?.unitId !== wave.unitId) throw new Error(`Missing wave ${wave.wave} boundary`);
  const movement = mobility.get(wave.unitId)?.data.record;
  const finalBoss = wave.wave === 55;
  return {
    number: wave.wave,
    unitId: wave.unitId,
    startUs: gameStartUs + us(wave.startsAfterGameStartSeconds),
    windowUs: boundary?.spawnWindowMicroseconds ?? 0,
    intervalUs: boundary?.spawnIntervalMicroseconds ?? 0,
    unitsPerBatch: boundary?.unitsPerBatchPerActivePortal ?? 1,
    batches: boundary?.webBatchesPerActivePortal ?? 1,
    welfareUs: wave.welfareStartOffsetSeconds === null || wave.welfareStartOffsetSeconds === undefined ?
      null : gameStartUs + us(wave.startsAfterGameStartSeconds + wave.welfareStartOffsetSeconds),
    deadlineUs: wave.timeLimitSeconds === undefined ?
      null : gameStartUs + us(wave.startsAfterGameStartSeconds + wave.timeLimitSeconds),
    hp: (finalBoss ? wave.baseHp - 3 * 600_000 : wave.baseHp) * multiplier,
    armor: finalBoss ? 1000 - 390 * multiplier : wave.baseArmor,
    mana: (finalBoss ? 300_000 : wave.baseMana ?? 0) * multiplier,
    speed: finalBoss ? 250 : wave.baseSpeed!,
    radius: mobility.get(wave.unitId)?.balance.record.collision ?? 1,
    layer: finalBoss || movement?.movetp === "fly" ? "fly" as const : "ground" as const,
    points: wave.capacityPointsPerUnit,
    abilities: enemyTemplateAbilities(wave.unitId),
  };
});

export const welfareTemplates = ["m999", "m998"].map(unitId => {
  const { data, balance } = mobility.get(unitId)!;
  return {
    unitId,
    radius: balance.record.collision,
    speed: balance.record.spd,
    points: 1,
    layer: data.record.movetp === "fly" ? "fly" as const : "ground" as const,
  };
});
