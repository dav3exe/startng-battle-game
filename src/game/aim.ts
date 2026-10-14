import * as THREE from 'three';
import type { Damageable } from './combat-types';

// Where the reticle (screen centre) is pointing: the first target or ground it meets along the
// camera ray, or a far point if nothing is there. Shots fly from the muzzle towards this point,
// so they land on the reticle even though the camera sits off his shoulder.
export function findAimPoint(
  ray: THREE.Ray,
  targets: readonly Damageable[],
  minDistance: number,
  maxDistance: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  let best = maxDistance;

  for (const target of targets) {
    if (!target.alive) continue;
    const t = rayCylinder(ray, target);
    if (t !== null && t > minDistance && t < best) best = t;
  }

  if (ray.direction.y < 0) {
    const t = -ray.origin.y / ray.direction.y;
    if (t > minDistance && t < best) best = t;
  }

  return ray.at(best, out);
}

// Distance along the ray to the side of an upright cylinder around the target, or null on a miss.
function rayCylinder(ray: THREE.Ray, target: Damageable): number | null {
  const ox = ray.origin.x - target.position.x;
  const oz = ray.origin.z - target.position.z;
  const dx = ray.direction.x;
  const dz = ray.direction.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - target.radius * target.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  const y = ray.origin.y + t * ray.direction.y;
  if (y < target.position.y || y > target.position.y + target.height) return null;
  return t;
}
