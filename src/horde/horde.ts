import * as THREE from 'three';
import { COMBAT_RULES } from '../game/combat-rules';
import type { Damageable } from '../game/combat-types';
import type { RunStats } from '../startng/leaderboard';
import type { CharacterStyle } from '../startng/player-style';
import { WAVE_RULES, ZOMBIE_KINDS, type ZombieKind } from './horde-rules';
import { Zombie } from './zombie';
import { buildZombieTemplate, disposeZombie, instantiateZombie } from './zombie-model';

// idle: training ground. intro: "Wave N" banner. fighting: zombies rising. cleared: short
// break after a wave. over: the player fell; back to the training ground after a moment.
export type HordePhase = 'idle' | 'intro' | 'fighting' | 'cleared' | 'over';

export interface HordePlayer {
  readonly position: THREE.Vector3;
  readonly invulnerable: boolean;
  health: number;
}

export interface HordeEvents {
  waveStarted: (wave: number) => void;
  waveCleared: (wave: number) => void;
  playerHit: (amount: number) => void;
  runEnded: (stats: RunStats) => void;
}

const KINDS = Object.keys(ZOMBIE_KINDS) as ZombieKind[];
const between = (min: number, max: number): number => min + Math.random() * (max - min);

// A random mix that always spends the same budget, so waves of the same number are about
// equally hard however the dice fall. The budget grows each wave.
export function planWave(wave: number): ZombieKind[] {
  let budget = WAVE_RULES.baseBudget + WAVE_RULES.budgetPerWave * (wave - 1);
  const plan: ZombieKind[] = [];
  for (;;) {
    const affordable = KINDS.filter((kind) => ZOMBIE_KINDS[kind].cost <= budget + 1e-6);
    if (affordable.length === 0) break;
    const total = affordable.reduce((sum, kind) => sum + ZOMBIE_KINDS[kind].weight, 0);
    let roll = Math.random() * total;
    let pick = affordable[0] ?? 'walker';
    for (const kind of affordable) {
      roll -= ZOMBIE_KINDS[kind].weight;
      if (roll <= 0) {
        pick = kind;
        break;
      }
    }
    plan.push(pick);
    budget -= ZOMBIE_KINDS[pick].cost;
  }
  return plan;
}

export class Horde {
  phase: HordePhase = 'idle';
  phaseTime = 0;
  wave = 0;
  kills = 0;
  wavesSurvived = 0;
  readonly zombies: Zombie[] = [];

  private template: THREE.Group;
  private queue: ZombieKind[] = [];
  private spawnIn = 0;
  private healthRestored = true;
  private player: HordePlayer | null = null;
  private readonly targetList: Damageable[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    style: CharacterStyle,
    private readonly events: HordeEvents,
  ) {
    this.template = buildZombieTemplate(style);
  }

  // New zombies rise in this look; ones already up keep theirs.
  setStyle(style: CharacterStyle): void {
    this.template = buildZombieTemplate(style);
  }

  get running(): boolean {
    return this.phase === 'intro' || this.phase === 'fighting' || this.phase === 'cleared';
  }

  // The player has just fallen and can't act.
  get playerDown(): boolean {
    return this.phase === 'over' && this.phaseTime < WAVE_RULES.downS;
  }

  get canStart(): boolean {
    return this.phase === 'idle' || (this.phase === 'over' && !this.playerDown);
  }

  get remaining(): number {
    return this.queue.length + this.zombies.filter((z) => z.alive).length;
  }

  get targets(): readonly Damageable[] {
    this.targetList.length = 0;
    for (const z of this.zombies) if (z.alive) this.targetList.push(z);
    return this.targetList;
  }

  start(player: HordePlayer): void {
    if (!this.canStart) return;
    for (const z of this.zombies) z.dismiss();
    this.wave = 0;
    this.kills = 0;
    this.wavesSurvived = 0;
    player.health = COMBAT_RULES.maxHealth;
    this.beginWave();
  }

  update(dt: number, time: number, player: HordePlayer): void {
    this.player = player;
    this.phaseTime += dt;

    if (this.running && player.health <= 0) this.end();

    if (this.phase === 'intro' && this.phaseTime >= WAVE_RULES.introS) this.setPhase('fighting');
    if (this.phase === 'fighting') {
      this.spawnDue(dt, player);
      if (this.queue.length === 0 && this.zombies.every((z) => !z.alive)) {
        this.wavesSurvived = this.wave;
        player.health = Math.min(COMBAT_RULES.maxHealth, player.health + WAVE_RULES.healOnClear);
        this.setPhase('cleared');
        this.events.waveCleared(this.wave);
      }
    }
    if (this.phase === 'cleared' && this.phaseTime >= WAVE_RULES.breakS) this.beginWave();
    if (this.phase === 'over' && !this.playerDown && !this.healthRestored) {
      player.health = COMBAT_RULES.maxHealth;
      this.healthRestored = true;
    }

    const ctx = {
      playerPosition: player.position,
      strike: (damage: number, maxPlayerY: number) => this.strike(damage, maxPlayerY),
    };
    for (const z of this.zombies) z.update(dt, time, ctx);
    this.separate(player);

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z?.gone) continue;
      this.scene.remove(z.parts.root);
      disposeZombie(z.parts);
      this.zombies.splice(i, 1);
    }
  }

  private setPhase(phase: HordePhase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  private beginWave(): void {
    this.wave += 1;
    this.queue = planWave(this.wave);
    this.spawnIn = 0;
    this.setPhase('intro');
    this.events.waveStarted(this.wave);
  }

  private end(): void {
    this.setPhase('over');
    this.healthRestored = false;
    this.queue = [];
    for (const z of this.zombies) z.dismiss();
    this.events.runEnded({ waves: this.wavesSurvived, kills: this.kills });
  }

  private strike(damage: number, maxPlayerY: number): void {
    const player = this.player;
    if (!player || !this.running || player.health <= 0) return;
    if (player.invulnerable || player.position.y > maxPlayerY) return;
    player.health = Math.max(0, player.health - damage);
    this.events.playerHit(damage);
  }

  private spawnDue(dt: number, player: HordePlayer): void {
    this.spawnIn -= dt;
    if (this.spawnIn > 0 || this.queue.length === 0) return;
    const maxAlive = Math.min(WAVE_RULES.maxAliveCap, WAVE_RULES.baseMaxAlive + WAVE_RULES.maxAlivePerWave * (this.wave - 1));
    const burst = Math.round(between(WAVE_RULES.burst[0], WAVE_RULES.burst[1]));
    for (let i = 0; i < burst; i++) {
      if (this.zombies.filter((z) => z.alive).length >= maxAlive) break;
      const kind = this.queue.pop();
      if (!kind) break;
      this.spawn(kind, player.position);
    }
    this.spawnIn = between(WAVE_RULES.spawnGapS[0], WAVE_RULES.spawnGapS[1]);
  }

  private spawn(kind: ZombieKind, playerPosition: THREE.Vector3): void {
    const w = this.wave - 1;
    const healthScale = 1 + WAVE_RULES.healthPerWave * w;
    const speedScale = Math.min(WAVE_RULES.maxSpeedScale, 1 + WAVE_RULES.speedPerWave * w);
    const parts = instantiateZombie(this.template, kind === 'flyer');
    const zombie = new Zombie(kind, parts, this.spawnPoint(playerPosition), healthScale, speedScale, () => {
      this.kills += 1;
    });
    this.scene.add(parts.root);
    this.zombies.push(zombie);
  }

  // Somewhere random in the clearing, not right on top of the player.
  private spawnPoint(playerPosition: THREE.Vector3): THREE.Vector3 {
    const point = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = between(WAVE_RULES.spawnMinRadius, WAVE_RULES.spawnMaxRadius);
      point.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (Math.hypot(point.x - playerPosition.x, point.z - playerPosition.z) >= WAVE_RULES.minPlayerDistance) return point;
    }
    // Opposite side of the clearing from the player.
    const away = new THREE.Vector3(-playerPosition.x, 0, -playerPosition.z);
    if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
    return away.normalize().multiplyScalar(WAVE_RULES.spawnMaxRadius);
  }

  // Zombies don't stand inside each other or the player, and stay in the clearing.
  private separate(player: HordePlayer): void {
    const live = this.zombies.filter((z) => z.alive);
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (!a) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (!b) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        const min = (a.radius + b.radius) * 0.9;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / 2 / d;
        a.position.x -= dx * push;
        a.position.z -= dz * push;
        b.position.x += dx * push;
        b.position.z += dz * push;
      }
      const px = a.position.x - player.position.x;
      const pz = a.position.z - player.position.z;
      const pd = Math.hypot(px, pz);
      const pmin = a.radius + 0.35;
      // Flyers overhead pass over him.
      const overhead = a.position.y > 1.2;
      if (!overhead && pd < pmin && pd > 1e-4) {
        a.position.x += (px / pd) * (pmin - pd);
        a.position.z += (pz / pd) * (pmin - pd);
      }
      const r = Math.hypot(a.position.x, a.position.z);
      if (r > WAVE_RULES.zombieArenaRadius) {
        a.position.x *= WAVE_RULES.zombieArenaRadius / r;
        a.position.z *= WAVE_RULES.zombieArenaRadius / r;
      }
    }
  }
}
