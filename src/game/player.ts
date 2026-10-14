import * as THREE from 'three';
import type { CharacterModel, Pose } from '../character/hooded-swordsman';
import { COMBAT_RULES } from './combat-rules';
import type { InputFrame } from './input';
import { TUNING } from './tuning';

type Action = 'none' | 'light' | 'heavy' | 'special' | 'dodge';

export interface PlayerHooks {
  fireBolt: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  fireCannon: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  melee: (origin: THREE.Vector3, facing: THREE.Vector3) => void;
}

// Moves the character and runs its attacks. Rendering and hit detection live elsewhere.
export class Player {
  readonly position = new THREE.Vector3();
  health: number = COMBAT_RULES.maxHealth;
  specialReadyAt = 0;

  private facing = 0;
  private action: Action = 'none';
  private actionTime = 0;
  private boltsFired = 0;
  private actionDone = false;
  private dodgeCooldown = 0;
  private recoil = 0;
  private aim = 0;
  private speed = 0;
  private readonly aimDir = new THREE.Vector3(0, 0, 1);
  private readonly dodgeDir = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  constructor(
    private readonly model: CharacterModel,
    private readonly hooks: PlayerHooks,
  ) {}

  get invulnerable(): boolean {
    return (
      this.action === 'dodge' &&
      this.actionTime >= TUNING.dodge.invulnerableFromS &&
      this.actionTime <= TUNING.dodge.invulnerableToS
    );
  }

  specialCooldownLeft(now: number): number {
    return Math.max(0, this.specialReadyAt - now);
  }

  update(dt: number, now: number, input: InputFrame, cameraForward: THREE.Vector3): void {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);

    // Movement relative to where the camera looks.
    const forward = cameraForward;
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const wish = new THREE.Vector3()
      .addScaledVector(forward, input.move.y)
      .addScaledVector(right, input.move.x);
    const wishAmount = Math.min(1, wish.length());
    if (wishAmount > 0) wish.normalize();

    if (this.action === 'none') this.startAction(input, now, wish, forward);

    let speedFactor = 1;
    if (this.action === 'light') speedFactor = TUNING.light.moveFactor;
    if (this.action === 'heavy') speedFactor = TUNING.heavy.moveFactor;
    if (this.action === 'special') speedFactor = 0.2;

    const baseSpeed = input.sprint && this.action === 'none' ? TUNING.move.sprintSpeed : TUNING.move.walkSpeed;
    if (this.action === 'dodge') {
      this.velocity.copy(this.dodgeDir).multiplyScalar(TUNING.dodge.speed);
    } else {
      this.velocity.copy(wish).multiplyScalar(baseSpeed * wishAmount * speedFactor);
    }
    this.position.addScaledVector(this.velocity, dt);
    this.speed = this.velocity.length() / TUNING.move.walkSpeed;

    // Stay inside the clearing.
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > TUNING.move.arenaRadius) this.position.multiplyScalar(TUNING.move.arenaRadius / r);

    // Face where you aim while attacking, otherwise where you move.
    let targetYaw = this.facing;
    if (this.action === 'light' || this.action === 'heavy' || this.action === 'special') {
      targetYaw = Math.atan2(this.aimDir.x, this.aimDir.z);
    } else if (wishAmount > 0.1) {
      targetYaw = Math.atan2(wish.x, wish.z);
    }
    let delta = targetYaw - this.facing;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.facing += delta * Math.min(1, dt * TUNING.move.turnSpeed);

    this.runAction(dt, now);

    const aiming = this.action === 'light' || this.action === 'special';
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);

    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.facing;
    this.model.update(now, this.pose());
  }

  private startAction(input: InputFrame, now: number, wish: THREE.Vector3, forward: THREE.Vector3): void {
    if (input.dodge && this.dodgeCooldown === 0) {
      this.begin('dodge');
      const back = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).negate();
      this.dodgeDir.copy(wish.lengthSq() > 0.01 ? wish : back).normalize();
      return;
    }
    if (input.special && now >= this.specialReadyAt) {
      this.begin('special');
      this.aimDir.copy(forward);
      return;
    }
    if (input.heavy) {
      this.begin('heavy');
      this.aimDir.copy(forward);
      return;
    }
    if (input.light) {
      this.begin('light');
      this.aimDir.copy(forward);
    }
  }

  private begin(action: Action): void {
    this.action = action;
    this.actionTime = 0;
    this.boltsFired = 0;
    this.actionDone = false;
  }

  private runAction(dt: number, now: number): void {
    if (this.action === 'none') return;
    this.actionTime += dt;
    const t = this.actionTime;

    if (this.action === 'light') {
      // Three bolts, one after another, so the target can react after the first.
      const nextAt = TUNING.light.firstBoltAtS + this.boltsFired * (COMBAT_RULES.light.intervalMs / 1000);
      if (this.boltsFired < COMBAT_RULES.light.hits && t >= nextAt) {
        this.hooks.fireBolt(this.worldPoint(this.model.arm.boltMuzzle), this.aimDir.clone());
        this.boltsFired += 1;
        this.recoil = 1;
      }
      if (t >= TUNING.light.durationS) this.action = 'none';
    }

    if (this.action === 'heavy') {
      if (!this.actionDone && t >= TUNING.heavy.hitAtS) {
        this.hooks.melee(this.position.clone(), this.aimDir.clone());
        this.actionDone = true;
      }
      if (t >= TUNING.heavy.durationS) this.action = 'none';
    }

    if (this.action === 'special') {
      if (!this.actionDone && t >= TUNING.special.fireAtS) {
        this.hooks.fireCannon(this.worldPoint(this.model.arm.cannonMuzzle), this.aimDir.clone());
        this.actionDone = true;
        this.recoil = 1;
        this.specialReadyAt = now + COMBAT_RULES.special.cooldownMs / 1000;
      }
      if (t >= TUNING.special.durationS) this.action = 'none';
    }

    if (this.action === 'dodge' && t >= TUNING.dodge.durationS) {
      this.action = 'none';
      this.dodgeCooldown = TUNING.dodge.cooldownS;
    }
  }

  private worldPoint(object: THREE.Object3D): THREE.Vector3 {
    this.model.root.updateMatrixWorld(true);
    return object.getWorldPosition(new THREE.Vector3());
  }

  private pose(): Pose {
    const t = this.actionTime;
    let cannon = 0;
    if (this.action === 'special') {
      const d = TUNING.special.durationS;
      cannon = t < 0.4 ? t / 0.4 : t < d * 0.75 ? 1 : Math.max(0, 1 - (t - d * 0.75) / (d * 0.25));
    }
    return {
      moveSpeed: this.speed,
      aim: this.aim,
      recoil: this.recoil,
      cannon,
      swing: this.action === 'heavy' ? Math.min(1, t / TUNING.heavy.durationS) : null,
      dodge: this.action === 'dodge' ? Math.min(1, t / TUNING.dodge.durationS) : null,
    };
  }
}
