import source from "../../../docs/rules/divine-books.json" with { type: "json" };

type Profile = { effective: Record<string, readonly (number | string)[]> };
const profiles: Readonly<Record<string, Profile>> = { ...source.formProfiles, ...source.auxiliaryProfiles };

export type DivineForm = { id: string; stars: number };

export function divineField(id: string, field: string, rank: number) {
  const value = profiles[id]?.effective[field]?.[rank - 1];
  return typeof value === "number" ? value : 0;
}

export function isDivineBook(id: string) {
  return id === "i258" || id === "i259" || id === "i260" || id === "i264";
}

export function divineStars(percent: number, six: number) {
  if (percent <= 92) return six;
  if (percent <= 98) return six > 4 ? 8 : 7;
  return six > 5 ? 10 : 9;
}

const elementMultipliers = [1.10, 1.12, 1.14, 1.16, 1.18, 1.20, 1.24, 1.28, 1.34, 1.40];
const allMultipliers = [1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.17, 1.19, 1.24, 1.30];

export function divineDamageFactor(form: DivineForm | undefined, kind: "weapon" | "physical" | "magic" | "divine") {
  if (!form) return 1;
  if (form.id === "P212") return allMultipliers[form.stars - 1];
  const element = kind === "magic" ? "P210" : kind === "divine" ? "P211" : "P209";
  return form.id === element ? elementMultipliers[form.stars - 1] : 1;
}
