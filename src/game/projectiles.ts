import * as THREE from 'three';
import { COMBAT_RULES } from './combat-rules';
import type { Damageable, DamageEvent } from './combat-types';
import { TUNING } from './tuning';

interface Shot {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  travelled: number;
  range: number;
  radius: number;
  kind: 'bolt' | 'cannon';
}

interface Blast {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  age: number;
}

const BLAST_LIFE_S = 0.45;

// Crossbow bolts, cannon shots and their blasts.
export class Projectiles {
  private readonly shots: Shot[] = [];
  private readonly blasts: Blast[] = [];
  private readonly boltGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6);
  private readonly boltTipGeometry = new THREE.ConeGeometry(0.02, 0.06, 6);
  private readonly boltMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6168, metalness: 0.8, roughness: 0.4 });
  private readonly boltGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a2a).multiplyScalar(2), toneMapped: false });
  private readonly cannonMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1a).multiplyScalar(3), toneMapped: false });
  private readonly blastGeometry = new THREE.SphereGeometry(1, 24, 16);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly onDamage: (event: DamageEvent) => void,
  ) {}

  fireBolt(origin: THREE.Vector3, direction: THREE.Vector3): void {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(this.boltGeometry, this.boltMaterial);
    shaft.rotation.x = Math.PI / 2;
    group.add(shaft);
    const tip = new THREE.Mesh(this.boltTipGeometry, this.boltGlow);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.23;
    group.add(tip);
    group.position.copy(origin);
    group.lookAt(origin.clone().add(direction));
    this.scene.add(group);
    this.shots.push({
      mesh: group,
      velocity: direction.clone().normalize().multiplyScalar(TUNING.light.boltSpeed),
      travelled: 0,
      range: TUNING.light.boltRange,
      radius: 0.08,
      kind: 'bolt',
    });
  }

  fireCannon(origin: THREE.Vector3, direction: THREE.Vector3): void {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), this.cannonMaterial);
    const light = new THREE.PointLight(0xff5a1a, 4, 5, 2);
    ball.add(light);
    ball.position.copy(origin);
    this.scene.add(ball);
    this.shots.push({
      mesh: ball,
      velocity: direction.clone().normalize().multiplyScalar(TUNING.special.shotSpeed),
      travelled: 0,
      range: TUNING.special.shotRange,
      radius: 0.14,
      kind: 'cannon',
    });
  }

  update(dt: number, targets: readonly Damageable[]): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      if (!shot) continue;
      const step = shot.velocity.clone().multiplyScalar(dt);
      shot.mesh.position.add(step);
      shot.travelled += step.length();

      const hit = targets.find((t) => t.alive && hits(shot, t));
      const expired = shot.travelled > shot.range || shot.mesh.position.y < 0;

      if (hit || expired) {
        if (shot.kind === 'bolt' && hit) {
          hit.takeDamage(COMBAT_RULES.light.damagePerHit);
          this.onDamage({ amount: COMBAT_RULES.light.damagePerHit, at: shot.mesh.position.clone() });
        }
        if (shot.kind === 'cannon') this.explode(shot.mesh.position.clone(), targets);
        this.scene.remove(shot.mesh);
        this.shots.splice(i, 1);
      }
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i];
      if (!blast) continue;
      blast.age += dt;
      const t = blast.age / BLAST_LIFE_S;
      blast.mesh.scale.setScalar(0.2 + t * TUNING.special.blastRadius);
      (blast.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - t));
      blast.light.intensity = Math.max(0, 30 * (1 - t));
      if (t >= 1) {
        this.scene.remove(blast.mesh, blast.light);
        this.blasts.splice(i, 1);
      }
    }
  }

  private explode(at: THREE.Vector3, targets: readonly Damageable[]): void {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff7a2a).multiplyScalar(2),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.blastGeometry, material);
    mesh.position.copy(at);
    const light = new THREE.PointLight(0xff6a2a, 30, 9, 2);
    light.position.copy(at);
    this.scene.add(mesh, light);
    this.blasts.push({ mesh, light, age: 0 });

    for (const target of targets) {
      if (!target.alive) continue;
      const center = target.position.clone().setY(target.position.y + target.height / 2);
      if (center.distanceTo(at) <= TUNING.special.blastRadius + target.radius) {
        target.takeDamage(COMBAT_RULES.special.damage);
        this.onDamage({ amount: COMBAT_RULES.special.damage, at: center });
      }
    }
  }
}

// Shot vs an upright cylinder around the target.
function hits(shot: Shot, target: Damageable): boolean {
  const p = shot.mesh.position;
  const dx = p.x - target.position.x;
  const dz = p.z - target.position.z;
  const inRadius = Math.hypot(dx, dz) <= target.radius + shot.radius;
  const inHeight = p.y >= target.position.y && p.y <= target.position.y + target.height;
  return inRadius && inHeight;
}
