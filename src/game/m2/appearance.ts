import source from "../../../docs/rules/platform-access-data.json" with { type: "json" };
import type { Seasons } from "./seasons.ts";

export const appearanceSlots = ["worker", "circle", "aura", "wings", "title", "accent"] as const;
export type AppearanceSlot = typeof appearanceSlots[number];
export type Appearance = Partial<Record<AppearanceSlot, string>>;

export const appearanceChoices = source.modelMappings.flatMap(entry => {
  const disposition = entry.webDisposition ?? "";
  if (!disposition.startsWith("direct_unlock_") && disposition !== "task_chain_retained_under_Q18" &&
      disposition !== "map_level_gate_removed_preexisting_decision" && disposition !== "original_zero_cost_claim") return [];
  const unitId = entry.effectUnit;
  if (entry.kind === 1 && !unitId?.startsWith("g")) return [];
  const slot: AppearanceSlot = entry.kind === 1 ? unitId!.startsWith("g2") ? "circle" : "worker" :
    entry.kind === 2 ? "aura" : entry.kind === 3 ? "wings" : entry.kind === 4 ? "title" : "accent";
  return [{ id: entry.skinAbility, name: entry.ui.Name, effectId: entry.effectAbility, unitId, slot,
    unlock: disposition === "task_chain_retained_under_Q18" ? entry.unlockTech : undefined }];
});

export function appearanceUnlocked(choice: typeof appearanceChoices[number], seasons: Seasons | undefined) {
  return !choice.unlock || !!(seasons?.spring.unlocks.includes(choice.unlock) || seasons?.summer.unlocks.includes(choice.unlock));
}

export function appearanceChoice(slot: AppearanceSlot, id: string | undefined) {
  return appearanceChoices.find(choice => choice.slot === slot && choice.id === id);
}
