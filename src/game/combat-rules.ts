// Shared combat rules: every character in the game uses the same numbers.
// Only looks and animations differ between characters.
export const COMBAT_RULES = {
  maxHealth: 100,
  // Light attack: greatsword slash.
  light: {
    damage: 10,
  },
  // Heavy attack: crossbow volley.
  heavy: {
    damagePerHit: 5,
    hits: 3,
    // Time between bolts, so a target can dodge after the first one.
    intervalMs: 220,
  },
  // Special: arm cannon.
  special: {
    damage: 20,
    cooldownMs: 60_000,
  },
} as const;

export type AttackKind = 'light' | 'heavy' | 'special';
