import * as THREE from 'three';
import { COMBAT_RULES } from './combat-rules';
import type { Damageable } from './combat-types';

const RESPAWN_S = 3;

// A straw training dummy on a post. It can strafe side to side so bolts can be dodged.
export class TrainingDummy implements Damageable {
  readonly root = new THREE.Group();
  readonly radius = 0.38;
  readonly height = 1.8;
  health: number = COMBAT_RULES.maxHealth;
  strafing = true;

  private readonly base: THREE.Vector3;
  private readonly body = new THREE.Group();
  private readonly straw: THREE.MeshStandardMaterial;
  private flash = 0;
  private deadFor = 0;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.base = position.clone();
    this.root.position.copy(position);

    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
    this.straw = new THREE.MeshStandardMaterial({ color: 0x6b5a34, roughness: 1 });
    const rope = new THREE.MeshStandardMaterial({ color: 0x2a2016, roughness: 1 });

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), wood);
    post.position.y = 0.9;
    this.body.add(post);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.75, 12), this.straw);
    torso.position.y = 1.15;
    this.body.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), this.straw);
    head.position.y = 1.68;
    this.body.add(head);

    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), wood);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 1.38;
    this.body.add(arms);

    for (const y of [0.92, 1.38]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.02, 6, 20), rope);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      this.body.add(band);
    }

    this.body.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    this.root.add(this.body);
    scene.add(this.root);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.flash = 1;
    this.body.rotation.x = -0.25;
    if (!this.alive) this.deadFor = 0;
  }

  update(dt: number, time: number): void {
    if (this.alive) {
      if (this.strafing) this.root.position.x = this.base.x + Math.sin(time * 0.9) * 2.2;
      // Wobble back after a hit.
      this.body.rotation.x += (0 - this.body.rotation.x) * Math.min(1, dt * 6);
    } else {
      this.deadFor += dt;
      this.body.rotation.x += (-Math.PI / 2 - this.body.rotation.x) * Math.min(1, dt * 5);
      if (this.deadFor >= RESPAWN_S) {
        this.health = COMBAT_RULES.maxHealth;
        this.body.rotation.x = 0;
      }
    }

    this.flash = Math.max(0, this.flash - dt * 5);
    this.straw.emissive.setRGB(this.flash * 0.6, 0, 0);
  }
}
