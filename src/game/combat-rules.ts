// Shared combat rules: every character in the game uses the same numbers.
// Only looks and animations differ between characters.
export const COMBAT_RULES = {
  maxHealth: 100,
  light: {
    damagePerHit: 5,
    hits: 3,
    // Time between bolts, so a target can dodge after the first one.
    intervalMs: 220,
  },
  heavy: {
    damage: 10,
  },
  special: {
    damage: 20,
    cooldownMs: 60_000,
  },
} as const;

export type AttackKind = 'light' | 'heavy' | 'special';
