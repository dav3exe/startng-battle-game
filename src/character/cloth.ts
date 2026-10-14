import * as THREE from 'three';
import { hash } from '../scene/noise';

// Long hooded cloak from the neck to just above the ankles, with folds and a torn hem.
export function createCloak(color: number): THREE.Mesh {
  const profile = [
    [0.46, 0.1],
    [0.44, 0.22],
    [0.4, 0.5],
    [0.35, 0.85],
    [0.32, 1.1],
    [0.33, 1.24],
    [0.33, 1.36],
    [0.26, 1.46],
    [0.12, 1.52],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const geometry = new THREE.LatheGeometry(profile, 72);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const angle = Math.atan2(v.z, v.x);
    const drop = THREE.MathUtils.clamp((1.25 - v.y) / 1.15, 0, 1);

    // Vertical folds that get deeper towards the hem.
    const fold = 1 + 0.06 * drop * Math.sin(angle * 11 + Math.sin(angle * 3) * 1.5);
    v.x *= fold * 1.18;
    v.z *= fold * 0.86;

    // Ragged, uneven hem.
    if (v.y < 0.12) {
      const tear = hash(Math.round(angle * 40)) * 0.12;
      v.y -= tear;
      v.x *= 1.04;
      v.z *= 1.04;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Draped shoulder mantle that the hood falls onto.
export function createMantle(color: number): THREE.Mesh {
  const profile = [
    [0.4, 1.24],
    [0.38, 1.32],
    [0.32, 1.42],
    [0.2, 1.52],
    [0.13, 1.57],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, 64);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const edge = y < 1.26 ? hash(Math.round(angle * 30)) * 0.06 : 0;
    pos.setXYZ(i, x * 1.22, y - edge, z * 0.9);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }),
  );
  mesh.castShadow = true;
  return mesh;
}

export interface Hood {
  group: THREE.Group;
  eyes: THREE.MeshBasicMaterial;
}

// Deep pointed hood. The face is a black void with two red eyes.
export function createHood(color: number, eyeColor: number): Hood {
  const group = new THREE.Group();
  const radius = 0.19;
  const opening = 1.15;

  const shell = new THREE.SphereGeometry(
    radius,
    48,
    32,
    Math.PI / 2 + opening / 2,
    Math.PI * 2 - opening,
    0,
    Math.PI * 0.78,
  );
  const pos = shell.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    // Pull the crown up and back into a point.
    if (y > 0) {
      const t = y / radius;
      y += 0.09 * t * t * t;
      z -= 0.07 * t * t;
    }
    // Hood front overhangs the face.
    if (z > 0) z += 0.03 * Math.max(0, y / radius);
    x *= 1.05;
    pos.setXYZ(i, x, y, z);
  }
  shell.computeVertexNormals();

  const shellMesh = new THREE.Mesh(
    shell,
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, side: THREE.DoubleSide }),
  );
  shellMesh.scale.set(1, 1.22, 1.12);
  shellMesh.castShadow = true;
  group.add(shellMesh);

  // Darkness inside the hood.
  const voidMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.86, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 }),
  );
  voidMesh.scale.set(1, 1.15, 1);
  voidMesh.position.z = -0.01;
  group.add(voidMesh);

  // Eyes are pushed past 1.0 brightness so only they bloom.
  const eyes = new THREE.MeshBasicMaterial({ color: eyeColor, toneMapped: false });
  eyes.color.multiplyScalar(2.6);
  const eyeGeometry = new THREE.SphereGeometry(0.0075, 12, 8);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyes);
    eye.scale.set(2.2, 0.6, 1);
    eye.position.set(side * 0.048, -0.005, 0.155);
    eye.rotation.z = side * -0.18;
    group.add(eye);
  }

  return { group, eyes };
}

export interface Cape {
  mesh: THREE.Mesh;
  update: (time: number) => void;
}

// Long black cape hanging from the shoulders. It sways in a slow wind.
export function createCape(color: number): Cape {
  const width = 0.95;
  const height = 1.5;
  const geometry = new THREE.PlaneGeometry(width, height, 20, 30);
  geometry.translate(0, -height / 2, 0);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);

  // Torn bottom edge.
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3] ?? 0;
    const y = base[i * 3 + 1] ?? 0;
    if (y < -height + 0.12) {
      base[i * 3 + 1] = y + hash(Math.round(x * 60)) * 0.22;
    }
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;

  const update = (time: number): void => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3] ?? 0;
      const y = base[i * 3 + 1] ?? 0;
      const down = -y / height;
      // Gathered at the shoulders, wide and heavy at the bottom.
      const flare = 0.55 + down * 0.95;
      const wave =
        Math.sin(time * 1.3 + down * 4 + x * 3) * 0.05 * down +
        Math.sin(time * 2.1 + x * 7) * 0.015 * down;
      // Wraps around the back near the top, billows out lower down.
      const wrap = Math.cos((x / width) * Math.PI) * 0.12 * (1 - down);
      pos.setXYZ(i, x * flare, y, -wrap - down * down * 0.28 - wave);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  update(0);

  return { mesh, update };
}
