export type Economy = {
  coins: number;
  stock: number;
  items: { id: string; kind: 'ore' | 'gear' }[];
  outcomes: Record<string, 'applied' | 'rejected'>;
};

export type EconomyCommand =
  | { kind: 'buy'; id: string; frame: number }
  | { kind: 'craft'; id: string; frame: number; materials: [string, string] };

export function executeEconomy(state: Economy, command: EconomyCommand) {
  if (Object.hasOwn(state.outcomes, command.id)) return state;
  const accepted = command.kind === 'buy'
    ? state.coins >= 2 && state.stock > 0
    : state.coins >= 1 && command.materials[0] !== command.materials[1]
      && command.materials.every(id => state.items.some(item => item.id === id && item.kind === 'ore'));
  const outcomes = { ...state.outcomes, [command.id]: accepted ? 'applied' as const : 'rejected' as const };
  if (!accepted) return { ...state, outcomes };
  if (command.kind === 'buy') {
    return {
      coins: state.coins - 2, stock: state.stock - 1, outcomes,
      items: [...state.items, { id: command.id, kind: 'ore' as const }],
    };
  }
  return {
    ...state, coins: state.coins - 1, outcomes,
    items: [
      ...state.items.filter(item => !command.materials.includes(item.id)),
      { id: command.id, kind: 'gear' as const },
    ],
  };
}
