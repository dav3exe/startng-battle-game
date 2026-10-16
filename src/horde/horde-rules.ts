// Numbers for the zombie horde. Player damage numbers stay in game/combat-rules.ts.
export type ZombieKind = 'walker' | 'crawler' | 'leaper' | 'flyer';

export interface KindRules {
  // Share of a wave's difficulty budget this zombie uses up.
  cost: number;
  // How likely it is to be picked, among the kinds the budget can still afford.
  weight: number;
  health: number;
  speed: number;
  damage: number;
  // Distance from its centre to the player's at which it attacks.
  reach: number;
  windupS: number;
  recoverS: number;
  radius: number;
  height: number;
}

export const ZOMBIE_KINDS: Record<ZombieKind, KindRules> = {
  // Slow, shambling, hits hard enough to hurt.
  walker: { cost: 1, weight: 4, health: 30, speed: 1.15, damage: 10, reach: 1.25, windupS: 0.6, recoverS: 0.7, radius: 0.4, height: 1.75 },
  // Low to the ground and quicker; a jump clears its bite.
  crawler: { cost: 1.25, weight: 3, health: 20, speed: 1.5, damage: 8, reach: 1.15, windupS: 0.45, recoverS: 0.6, radius: 0.55, height: 0.6 },
  // Closes the gap with a pounce; dash sideways when it crouches.
  leaper: { cost: 2, weight: 2, health: 25, speed: 2.1, damage: 14, reach: 1.25, windupS: 0.5, recoverS: 0.9, radius: 0.4, height: 1.7 },
  // Circles overhead out of sword reach and swoops in; shoot it, or cut it as it dives.
  flyer: { cost: 2, weight: 2, health: 15, speed: 3.2, damage: 9, reach: 1.2, windupS: 0, recoverS: 0.5, radius: 0.45, height: 1.6 },
};

export const WAVE_RULES = {
  // Every wave of the same number costs the same, whatever mix the dice pick.
  baseBudget: 5,
  budgetPerWave: 2.5,
  healthPerWave: 0.07,
  speedPerWave: 0.03,
  maxSpeedScale: 1.45,
  baseMaxAlive: 4,
  maxAlivePerWave: 1,
  maxAliveCap: 14,
  // Random pause between spawns, and how many rise at once.
  spawnGapS: [0.7, 2.6],
  burst: [1, 3],
  introS: 2.5,
  breakS: 4,
  healOnClear: 25,
  // How long the player stays down before the training ground comes back.
  downS: 2.5,
  spawnMinRadius: 6,
  spawnMaxRadius: 10.5,
  minPlayerDistance: 5,
  zombieArenaRadius: 12,
} as const;
