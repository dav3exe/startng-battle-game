import type * as THREE from 'three';

// Anything that can be hit: training dummies now, other players later.
export interface Damageable {
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly height: number;
  readonly alive: boolean;
  takeDamage: (amount: number) => void;
}

export interface DamageEvent {
  amount: number;
  at: THREE.Vector3;
}
