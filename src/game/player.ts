import * as THREE from 'three';
import type { CharacterModel, Pose } from '../character/hooded-swordsman';
import { COMBAT_RULES } from './combat-rules';
import type { InputFrame } from './input';
import { TUNING } from './tuning';

// Light = greatsword slash, heavy = crossbow volley, special = arm cannon.
type Action = 'none' | 'slash' | 'volley' | 'cannon' | 'dodge';

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
  // 1 = forehand (right to left), -1 = backhand return cut.
  private swingSide: 1 | -1 = 1;
  private lastSlashEndedAt = -Infinity;
  private readonly aimPoint = new THREE.Vector3(0, 1.4, 10);
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

  // aimPoint is where the reticle points in the world; shots fly towards it.
  update(dt: number, now: number, input: InputFrame, cameraForward: THREE.Vector3, aimPoint: THREE.Vector3): void {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.aimPoint.copy(aimPoint);

    // Movement relative to where the camera looks.
    const forward = cameraForward;
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const wish = new THREE.Vector3()
      .addScaledVector(forward, input.move.y)
      .addScaledVector(right, input.move.x);
    const wishAmount = Math.min(1, wish.length());
    if (wishAmount > 0) wish.normalize();

    const canCancelSlash = this.action === 'slash' && this.actionTime >= TUNING.light.cancelAtS;
    if (this.action === 'none' || canCancelSlash) this.startAction(input, now, wish, forward);

    let speedFactor = 1;
    if (this.action === 'slash') speedFactor = TUNING.light.moveFactor;
    if (this.action === 'volley') speedFactor = TUNING.heavy.moveFactor;
    if (this.action === 'cannon') speedFactor = 0.2;

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

    // Shooting faces the reticle; slashing follows the stick so he can cut on the move.
    let targetYaw = this.facing;
    let turnSpeed: number = TUNING.move.turnSpeed;
    if (this.action === 'volley' || this.action === 'cannon') {
      const toAim = this.aimPoint.clone().sub(this.position).setY(0);
      if (toAim.lengthSq() > 0.01) targetYaw = Math.atan2(toAim.x, toAim.z);
    } else if (wishAmount > 0.1) {
      targetYaw = Math.atan2(wish.x, wish.z);
      if (this.action === 'slash') turnSpeed = TUNING.light.turnSpeed;
    }
    let delta = targetYaw - this.facing;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.facing += delta * Math.min(1, dt * turnSpeed);

    this.runAction(dt, now);

    const aiming = this.action === 'volley' || this.action === 'cannon';
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);

    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.facing;
    this.model.update(now, this.pose());
  }

  private startAction(input: InputFrame, now: number, wish: THREE.Vector3, forward: THREE.Vector3): void {
    const wasSlashing = this.action === 'slash';
    if (input.dodge && this.dodgeCooldown === 0) {
      if (wasSlashing) this.lastSlashEndedAt = now;
      this.begin('dodge');
      const back = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)).negate();
      this.dodgeDir.copy(wish.lengthSq() > 0.01 ? wish : back).normalize();
      return;
    }
    if (input.light) {
      // A quick follow-up swings back the other way; otherwise start with the forehand.
      const chained = wasSlashing || now - this.lastSlashEndedAt <= TUNING.light.comboWindowS;
      this.swingSide = chained ? (this.swingSide === 1 ? -1 : 1) : 1;
      // Standing still, cut where the camera looks; on the move, the stick decides.
      if (wish.lengthSq() < 0.01) this.facing = Math.atan2(forward.x, forward.z);
      this.begin('slash');
      return;
    }
    if (wasSlashing) return;
    if (input.special && now >= this.specialReadyAt) {
      this.begin('cannon');
      return;
    }
    if (input.heavy) this.begin('volley');
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

    if (this.action === 'slash') {
      if (!this.actionDone && t >= TUNING.light.hitAtS) {
        this.hooks.melee(this.position.clone(), this.facingDir());
        this.actionDone = true;
      }
      if (t >= TUNING.light.durationS) {
        this.action = 'none';
        this.lastSlashEndedAt = now;
      }
    }

    if (this.action === 'volley') {
      // Three bolts, one after another, so the target can react after the first.
      const nextAt = TUNING.heavy.firstBoltAtS + this.boltsFired * (COMBAT_RULES.heavy.intervalMs / 1000);
      if (this.boltsFired < COMBAT_RULES.heavy.hits && t >= nextAt) {
        const muzzle = this.worldPoint(this.model.arm.boltMuzzle);
        this.hooks.fireBolt(muzzle, this.directionTo(muzzle));
        this.boltsFired += 1;
        this.recoil = 1;
      }
      if (t >= TUNING.heavy.durationS) this.action = 'none';
    }

    if (this.action === 'cannon') {
      if (!this.actionDone && t >= TUNING.special.fireAtS) {
        const muzzle = this.worldPoint(this.model.arm.cannonMuzzle);
        this.hooks.fireCannon(muzzle, this.directionTo(muzzle));
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

  private facingDir(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  // From the muzzle to the reticle point. Falls back to straight ahead if the point is too close.
  private directionTo(from: THREE.Vector3): THREE.Vector3 {
    const dir = this.aimPoint.clone().sub(from);
    return dir.lengthSq() > 0.25 ? dir.normalize() : this.facingDir();
  }

  private worldPoint(object: THREE.Object3D): THREE.Vector3 {
    this.model.root.rotation.y = this.facing;
    this.model.root.updateMatrixWorld(true);
    return object.getWorldPosition(new THREE.Vector3());
  }

  private pose(): Pose {
    const t = this.actionTime;
    let cannon = 0;
    if (this.action === 'cannon') {
      const d = TUNING.special.durationS;
      cannon = t < 0.4 ? t / 0.4 : t < d * 0.75 ? 1 : Math.max(0, 1 - (t - d * 0.75) / (d * 0.25));
    }
    return {
      moveSpeed: this.speed,
      aim: this.aim,
      recoil: this.recoil,
      cannon,
      swing: this.action === 'slash' ? Math.min(1, t / TUNING.light.durationS) : null,
      swingSide: this.swingSide,
      dodge: this.action === 'dodge' ? Math.min(1, t / TUNING.dodge.durationS) : null,
    };
  }
}
