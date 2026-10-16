import * as THREE from 'three';
import type { Damageable } from '../game/combat-types';
import { ZOMBIE_KINDS, type KindRules, type ZombieKind } from './horde-rules';
import type { ZombieParts } from './zombie-model';

type State = 'emerging' | 'chase' | 'windup' | 'recover' | 'crouch' | 'leap' | 'hover' | 'swoop' | 'climb' | 'dying';

export interface ZombieContext {
  playerPosition: THREE.Vector3;
  // An attack reached the player. The horde decides if it lands: a dodge, or jumping above
  // maxPlayerY, makes it miss.
  strike: (damage: number, maxPlayerY: number) => void;
}

const LEAP = { minDistance: 2.5, maxDistance: 7, crouchS: 0.4, flightS: 0.7, cooldownS: 3, gravity: 18, landRadius: 1.5 };
const FLY = { hoverY: 2.1, orbitRadius: 5, orbitSpeed: 0.6, hoverMinS: 2, hoverMaxS: 4, swoopY: 0.25, swoopSpeed: 7, climbSpeed: 3.5, swoopTimeoutS: 2.5 };
const EMERGE_S = 1.1;
const DEATH_S = 2.4;
const TURN_SPEED = 5;
const STAGGER_S = 0.18;

const ease = (t: number): number => t * t * (3 - 2 * t);
const lerp = THREE.MathUtils.lerp;
const between = (min: number, max: number): number => min + Math.random() * (max - min);

export class Zombie implements Damageable {
  readonly radius: number;
  readonly height: number;
  readonly maxHealth: number;
  health: number;
  // Finished dying and sinking: the horde removes it.
  gone = false;

  private state: State = 'emerging';
  private stateTime = 0;
  private facing = Math.random() * Math.PI * 2;
  private gait = Math.random() * 10;
  private flash = 0;
  private stagger = 0;
  private leapCooldown = between(1, 3);
  private hoverFor = between(FLY.hoverMinS, FLY.hoverMaxS);
  private readonly orbitDir = Math.random() < 0.5 ? -1 : 1;
  private readonly velocity = new THREE.Vector3();
  private readonly toPlayer = new THREE.Vector3();
  private readonly rules: KindRules;
  private readonly speed: number;
  // Each one shambles a little differently.
  private readonly tilt = (Math.random() - 0.5) * 0.5;
  private readonly limp = 0.45 + Math.random() * 0.55;

  constructor(
    readonly kind: ZombieKind,
    readonly parts: ZombieParts,
    spawn: THREE.Vector3,
    healthScale: number,
    speedScale: number,
    private readonly onKilled: () => void,
  ) {
    this.rules = ZOMBIE_KINDS[kind];
    this.radius = this.rules.radius;
    this.height = this.rules.height;
    this.maxHealth = Math.round(this.rules.health * healthScale);
    this.health = this.maxHealth;
    this.speed = this.rules.speed * speedScale * between(0.85, 1.15);
    parts.root.position.copy(spawn);
    parts.root.position.y = kind === 'flyer' ? 6 : kind === 'crawler' ? -0.8 : -1.7;
    this.animate(0);
  }

  get position(): THREE.Vector3 {
    return this.parts.root.position;
  }

  get alive(): boolean {
    return this.health > 0 && this.state !== 'dying';
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.flash = 1;
    this.stagger = STAGGER_S;
    if (this.health === 0) {
      this.die();
      this.onKilled();
    }
  }

  // Sinks back into the ground without counting as a kill (the run ended).
  dismiss(): void {
    if (this.state === 'dying') return;
    this.health = 0;
    this.die();
  }

  update(dt: number, time: number, ctx: ZombieContext): void {
    this.stateTime += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.stagger = Math.max(0, this.stagger - dt);

    const to = this.toPlayer.copy(ctx.playerPosition).sub(this.position).setY(0);
    const distance = to.length();

    if (this.state === 'dying') this.updateDeath(dt);
    else if (this.state === 'emerging') this.updateEmerge();
    else if (this.stagger === 0) {
      if (this.kind === 'flyer') this.updateFlyer(dt, time, to, distance, ctx);
      else this.updateGround(dt, to, distance, ctx);
    }

    this.animate(time);
  }

  private enter(state: State): void {
    this.state = state;
    this.stateTime = 0;
    if (state === 'hover') this.hoverFor = between(FLY.hoverMinS, FLY.hoverMaxS);
  }

  private die(): void {
    this.enter('dying');
    this.velocity.set(0, 0, 0);
  }

  private turnTowards(dir: THREE.Vector3, dt: number, speed = TURN_SPEED): void {
    if (dir.lengthSq() < 1e-4) return;
    let delta = Math.atan2(dir.x, dir.z) - this.facing;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.facing += delta * Math.min(1, dt * speed);
  }

  private updateEmerge(): void {
    const t = Math.min(1, this.stateTime / EMERGE_S);
    if (this.kind === 'flyer') this.position.y = lerp(6, FLY.hoverY, ease(t));
    else this.position.y = lerp(this.kind === 'crawler' ? -0.8 : -1.7, 0, 1 - Math.pow(1 - t, 3));
    if (t >= 1) this.enter(this.kind === 'flyer' ? 'hover' : 'chase');
  }

  private updateGround(dt: number, to: THREE.Vector3, distance: number, ctx: ZombieContext): void {
    const r = this.rules;
    this.leapCooldown -= dt;

    if (this.state === 'chase') {
      this.turnTowards(to, dt);
      if (distance <= r.reach) {
        this.enter('windup');
        return;
      }
      if (this.kind === 'leaper' && this.leapCooldown <= 0 && distance >= LEAP.minDistance && distance <= LEAP.maxDistance) {
        this.enter('crouch');
        return;
      }
      // Walks the way it faces, so it lurches round in curves instead of sliding.
      const step = Math.min(this.speed * dt, Math.max(0, distance - r.reach * 0.8));
      this.position.x += Math.sin(this.facing) * step;
      this.position.z += Math.cos(this.facing) * step;
      this.gait += dt * this.speed * 3.4;
    } else if (this.state === 'windup') {
      this.turnTowards(to, dt, 2);
      if (this.stateTime >= r.windupS) {
        if (distance <= r.reach + 0.35) ctx.strike(r.damage, this.kind === 'crawler' ? 0.45 : 0.9);
        this.enter('recover');
      }
    } else if (this.state === 'recover') {
      if (this.stateTime >= r.recoverS) this.enter('chase');
    } else if (this.state === 'crouch') {
      this.turnTowards(to, dt, 8);
      if (this.stateTime >= LEAP.crouchS) {
        // Pounce at where the player is now: dash aside to make it miss.
        this.velocity.set(to.x / LEAP.flightS, (LEAP.gravity * LEAP.flightS) / 2, to.z / LEAP.flightS);
        this.enter('leap');
      }
    } else if (this.state === 'leap') {
      this.position.addScaledVector(this.velocity, dt);
      this.velocity.y -= LEAP.gravity * dt;
      if (this.position.y <= 0 && this.velocity.y < 0) {
        this.position.y = 0;
        if (distance <= LEAP.landRadius) ctx.strike(r.damage, 1);
        this.leapCooldown = LEAP.cooldownS;
        this.enter('recover');
      }
    }
  }

  private updateFlyer(dt: number, time: number, to: THREE.Vector3, distance: number, ctx: ZombieContext): void {
    const p = this.position;
    this.gait += dt * 2;

    if (this.state === 'hover') {
      // Circle the player, out of sword reach.
      const angle = Math.atan2(-to.x, -to.z) + this.orbitDir * FLY.orbitSpeed * dt;
      const goalX = ctx.playerPosition.x + Math.sin(angle) * FLY.orbitRadius;
      const goalZ = ctx.playerPosition.z + Math.cos(angle) * FLY.orbitRadius;
      const dx = goalX - p.x;
      const dz = goalZ - p.z;
      const gap = Math.hypot(dx, dz);
      const step = Math.min(gap, this.speed * dt);
      if (gap > 1e-3) {
        p.x += (dx / gap) * step;
        p.z += (dz / gap) * step;
      }
      p.y += (FLY.hoverY + Math.sin(time * 2 + this.gait) * 0.15 - p.y) * Math.min(1, dt * 3);
      this.turnTowards(to, dt);
      if (this.stateTime >= this.hoverFor) this.enter('swoop');
    } else if (this.state === 'swoop') {
      const dir = new THREE.Vector3(to.x, FLY.swoopY - p.y, to.z);
      const length = dir.length();
      if (length > 1e-3) p.addScaledVector(dir, Math.min(length, FLY.swoopSpeed * dt) / length);
      this.turnTowards(to, dt, 8);
      if (distance <= this.rules.reach && Math.abs(p.y - FLY.swoopY) < 0.6) {
        ctx.strike(this.rules.damage, 1.3);
        this.enter('climb');
      } else if (this.stateTime >= FLY.swoopTimeoutS) {
        this.enter('climb');
      }
    } else if (this.state === 'climb') {
      p.y += FLY.climbSpeed * dt;
      if (distance > 1e-3) {
        p.x -= (to.x / distance) * this.speed * 0.5 * dt;
        p.z -= (to.z / distance) * this.speed * 0.5 * dt;
      }
      if (p.y >= FLY.hoverY) this.enter('hover');
    }
  }

  private updateDeath(dt: number): void {
    const p = this.position;
    if (this.kind === 'flyer' && p.y > 0) {
      this.velocity.y -= 18 * dt;
      p.y = Math.max(0, p.y + this.velocity.y * dt);
    }
    if (this.stateTime > 1.2) p.y -= dt * 0.5;
    if (this.stateTime >= DEATH_S) this.gone = true;
  }

  // Turns the current state into a pose.
  private animate(time: number): void {
    const { root, pelvis, spine, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, wingL, wingR, materials } = this.parts;
    const t = this.stateTime;
    const g = this.gait;
    const swing = Math.sin(g);

    // Defaults: hunched, arms reaching out.
    let lean = this.kind === 'leaper' ? 0.45 : 0.25;
    let armX = -1.35;
    let foreX = -0.2;
    let legSwing = 0;
    let pelvisY = this.parts.pelvisY;
    let pelvisX = 0;
    let headX = -0.15 + Math.sin(time * 7 + g) * 0.03;
    let fall = 0;

    if (this.kind === 'crawler') {
      // Face down, dragging itself along by the arms; the legs trail behind.
      pelvisX = 1.4;
      pelvisY = 0.2;
      lean = 0;
      headX = -1.05;
      const pull = this.state === 'chase' ? swing : 0;
      armL.rotation.x = -2.1 + pull * 0.5;
      armR.rotation.x = -2.1 - pull * 0.5;
      foreL.rotation.x = -0.3 - Math.max(0, pull) * 0.5;
      foreR.rotation.x = -0.3 - Math.max(0, -pull) * 0.5;
      if (this.state === 'windup') {
        const q = Math.min(1, t / this.rules.windupS);
        headX -= q * 0.4;
        armL.rotation.x = armR.rotation.x = lerp(-2.1, -2.8, q);
      }
      legL.rotation.x = 0.05 + Math.sin(time * 1.3 + g) * 0.06;
      legR.rotation.x = 0.08 - Math.sin(time * 1.1 + g) * 0.06;
      shinL.rotation.x = shinR.rotation.x = 0.15;
      pelvis.rotation.y = pull * 0.12;
    } else if (this.kind === 'flyer') {
      lean = this.state === 'swoop' ? 0.9 : 0.35;
      armX = this.state === 'swoop' ? -1.7 : -1.4;
      legL.rotation.x = 0.25 + Math.sin(time * 2 + g) * 0.15;
      legR.rotation.x = 0.25 + Math.sin(time * 2 + g + 1.3) * 0.15;
      shinL.rotation.x = shinR.rotation.x = 0.5;
      const flap = this.state === 'dying' ? 0 : Math.sin(time * (this.state === 'swoop' ? 4 : 10) + g);
      const sweep = this.state === 'swoop' ? -0.6 : 0.35;
      wingL.rotation.y = sweep + flap * 0.6;
      wingR.rotation.y = -(sweep + flap * 0.6);
    } else {
      // Walker and leaper: a limping shamble.
      const moving = this.state === 'chase' ? 1 : 0;
      legSwing = (this.kind === 'leaper' ? 0.55 : 0.42) * moving;
      legL.rotation.x = swing * legSwing;
      legR.rotation.x = -swing * legSwing * this.limp;
      shinL.rotation.x = Math.max(0, -swing) * 0.8 * moving;
      shinR.rotation.x = Math.max(0, swing) * 0.8 * moving * this.limp;
      pelvisY -= Math.abs(swing) * 0.03 * moving;
      pelvis.rotation.z = swing * 0.07 * moving;
      armX += Math.sin(g + 1) * 0.12;

      if (this.state === 'windup') {
        // Arms go up, then come down hard at the end.
        const q = Math.min(1, t / this.rules.windupS);
        armX = q < 0.75 ? lerp(-1.35, -2.6, ease(q / 0.75)) : lerp(-2.6, -0.8, (q - 0.75) / 0.25);
        lean = q < 0.75 ? lean - 0.15 * q : lean + 0.3;
      } else if (this.state === 'recover') {
        armX = lerp(-0.8, -1.35, Math.min(1, t / this.rules.recoverS));
      } else if (this.state === 'crouch') {
        const q = ease(Math.min(1, t / LEAP.crouchS));
        pelvisY = lerp(this.parts.pelvisY, 0.68, q);
        legL.rotation.x = legR.rotation.x = -0.9 * q;
        shinL.rotation.x = shinR.rotation.x = 1.6 * q;
        lean = lerp(lean, 0.75, q);
        armX = lerp(armX, 0.5, q);
      } else if (this.state === 'leap') {
        legL.rotation.x = legR.rotation.x = -1.1;
        shinL.rotation.x = shinR.rotation.x = 1.5;
        lean = 0.3;
        armX = -2.3;
        foreX = -0.4;
      } else if (this.state === 'emerging') {
        // Clawing its way up out of the dirt.
        armX = -2.8 + Math.sin(time * 6 + g) * 0.25;
        lean = 0.05;
      }
    }

    if (this.state === 'dying') {
      fall = ease(Math.min(1, t / 0.6));
      armX = lerp(armX, -0.3, fall);
    }

    if (this.kind !== 'crawler') {
      armL.rotation.x = armX;
      armR.rotation.x = armX + 0.1;
      armL.rotation.z = 0.12;
      armR.rotation.z = -0.12;
      foreL.rotation.x = foreX;
      foreR.rotation.x = foreX - 0.1;
    }

    pelvis.position.y = pelvisY;
    pelvis.rotation.x = pelvisX;
    spine.rotation.x = lean + Math.sin(g * 2) * 0.03 - (this.stagger / STAGGER_S) * 0.5;
    spine.rotation.z = this.tilt * 0.3;
    head.rotation.x = headX;
    head.rotation.z = this.tilt + Math.sin(time * 1.7 + g) * 0.06;

    root.rotation.y = this.facing;
    // Topples backwards; a crawler just goes limp.
    root.rotation.x = this.kind === 'crawler' ? 0 : -fall * 1.45;

    for (const m of materials) m.emissive.setRGB(this.flash * 0.6, this.flash * 0.05, 0);
  }
}
