import { economy, items, map, recipes, shop, towers } from "./content.ts";
import type { CommandResult, MatchState, PlayerAction, ScheduledCommand, Tower } from "./state.ts";

export type EconomyAction = Exclude<PlayerAction, { type: "attack" | "overcharge" | "enter-endless" | "restart" }>;
export type Rejection = Extract<CommandResult, { ok: false }>["reason"];
export type Outcome = { ok: true; createdId?: number } | { ok: false; reason: Rejection };

const reject = (reason: Rejection): Outcome => ({ ok: false, reason });
const success: Outcome = { ok: true };

export function shopStock(mode: MatchState["mode"]): MatchState["stock"] {
  return Object.fromEntries(Object.entries(shop).map(([id, item]) => [id, item.stock[mode]])) as MatchState["stock"];
}

export function towerStats(tower: Tower) {
  return towers[tower.type].levels[tower.level - 1];
}

export function executeEconomy(state: MatchState, action: EconomyAction): Outcome {
  const backpack = state.items.filter(item => item.owner.type === "backpack");
  switch (action.type) {
    case "build": {
      const card = state.cards.find(card => card.id === action.cardId);
      if (!card || !Object.hasOwn(map.buildSites, action.site)) return reject("missing");
      if (state.towers.some(tower => tower.site === action.site)) return reject("occupied");
      const cost = towers[card.tower].buildGold;
      if (state.gold < cost) return reject("gold");
      const id = state.nextInstanceId++;
      state.gold -= cost;
      state.cards = state.cards.filter(entry => entry !== card);
      state.towers.push({ id, type: card.tower, site: action.site, level: 1, attackReadyFrame: 0, skillReadyFrames: {} });
      return { ok: true, createdId: id };
    }
    case "upgrade": {
      const tower = state.towers.find(tower => tower.id === action.towerId);
      if (!tower) return reject("missing");
      const next = towers[tower.type].levels[tower.level];
      if (!next || !("upgradeGold" in next)) return reject("max-level");
      if (state.gold < next.upgradeGold) return reject("gold");
      state.gold -= next.upgradeGold;
      tower.level++;
      return success;
    }
    case "draw": {
      if (state.cards.length >= economy.cardCapacity) return reject("capacity");
      if (state.gold < economy.drawGold) return reject("gold");
      const random = (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0;
      const tower = economy.drawPool[Math.floor(random / 2 ** 32 * economy.drawPool.length)];
      const id = state.nextInstanceId++;
      state.gold -= economy.drawGold;
      state.randomState = random;
      state.cards.push({ id, tower });
      return { ok: true, createdId: id };
    }
    case "buy": {
      if (!Object.hasOwn(shop, action.item)) return reject("missing");
      if (state.stock[action.item] < 1) return reject("stock");
      if (backpack.length >= economy.backpackCapacity) return reject("capacity");
      const cost = shop[action.item].gold;
      if (state.gold < cost) return reject("gold");
      const id = state.nextInstanceId++;
      state.gold -= cost;
      state.stock[action.item]--;
      state.items.push({ id, type: action.item, owner: { type: "backpack" } });
      return { ok: true, createdId: id };
    }
    case "craft": {
      if (!Object.hasOwn(recipes, action.recipe)) return reject("missing");
      const recipe = recipes[action.recipe];
      const ids = new Set(action.materialIds);
      const materials = backpack.filter(item => ids.has(item.id));
      const types = materials.map(item => item.type).sort();
      if (ids.size !== action.materialIds.length || types.length !== ids.size ||
          types.length !== recipe.ingredients.length ||
          [...recipe.ingredients].sort().some((type, index) => type !== types[index])) return reject("materials");
      if (backpack.length - materials.length >= economy.backpackCapacity) return reject("capacity");
      if (state.gold < recipe.gold) return reject("gold");
      const id = state.nextInstanceId++;
      state.gold -= recipe.gold;
      state.items = state.items.filter(item => !ids.has(item.id));
      state.items.push({ id, type: action.recipe, owner: { type: "backpack" } });
      return { ok: true, createdId: id };
    }
    case "equip": {
      const item = backpack.find(item => item.id === action.itemId);
      if (!item || !("bonusDamage" in items[item.type]) || !state.towers.some(tower => tower.id === action.towerId)) {
        return reject("missing");
      }
      const previous = state.items.find(item => item.owner.type === "tower" && item.owner.id === action.towerId);
      if (previous) previous.owner = { type: "backpack" };
      item.owner = { type: "tower", id: action.towerId };
      return success;
    }
  }
}

export function recordResult(state: MatchState, command: ScheduledCommand, outcome: Outcome) {
  state.results.push({ id: command.id, sequence: command.sequence, ...outcome });
}
