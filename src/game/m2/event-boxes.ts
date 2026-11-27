import source from "../../../docs/rules/event-boxes-data.json" with { type: "json" };

const cooldownGroups: Record<string, string> = source.inventoryAndNative.cooldownGroups;
export const eventBoxCost = source.purchase.cost;
export const eventBoxOffers = new Map(source.boxes.map(box => [box.shopItem, box]));
export const eventBoxes = new Map(source.boxes.map(box => [box.usableItem,
  { ...box, cooldownGroup: cooldownGroups[box.usableItem] }]));
