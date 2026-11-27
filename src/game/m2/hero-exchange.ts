import target from "../../../docs/m3-configuration.json" with { type: "json" };
import { cardTemplates } from "./content.ts";

const { mall, score } = target.heroExchanges;
export const mallHeroLimit = (wave: number) => wave < 41 ? mall.sharedLimit : mall.sharedLimitFromWave41;

const offers = new Map([
  ...Object.entries(mall.offers).map(([id, offer]) => [id, { card: offer.card, cost: 0 }] as const),
  ...Object.entries(score.offers).map(([id, offer]) => [id, { card: offer.card, cost: offer.score }] as const),
]);
export const heroExchangeOffers = new Map([...offers].filter(([, offer]) => cardTemplates.has(offer.card)));
