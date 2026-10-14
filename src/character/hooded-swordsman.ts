import * as THREE from 'three';
import type { CharacterSpec } from './character-spec';
import { createCape, createCloak, createHood, createMantle } from './cloth';
import { createGreatsword, createIronArm, type IronArm } from './weapons';

export interface CharacterModel {
  root: THREE.Group;
  arm: IronArm;
  update: (time: number) => void;
}

// Builds the character from its spec. Faces +z; about 1.95 m tall to the tip of the hood.
export function createHoodedSwordsman(spec: CharacterSpec): CharacterModel {
  const root = new THREE.Group();
  root.name = spec.name;

  const body = new THREE.Group();
  root.add(body);

  const cape = createCape(spec.colors.cape);
  cape.mesh.position.set(0, 1.47, -0.2);
  body.add(cape.mesh);

  body.add(createCloak(spec.colors.cloak));
  body.add(createMantle(spec.colors.cloak));

  const hood = createHood(spec.colors.cloak, spec.colors.eyes);
  hood.group.position.set(0, 1.71, 0.02);
  body.add(hood.group);

  // Greatsword across the back: hilt above the right shoulder, blade angled down.
  const sword = createGreatsword(spec.colors);
  sword.position.set(-0.08, 1.5, -0.42);
  sword.rotation.set(0.12, 0, 0.46);
  body.add(sword);

  // Iron left arm comes out of the cloak with the crossbow raised.
  const arm = createIronArm(spec.colors);
  arm.group.position.set(0.36, 1.32, 0.05);
  arm.group.rotation.z = 0.08;
  body.add(arm.group);

  // Boots under the hem.
  const bootMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.7, metalness: 0.2 });
  for (const side of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.26), bootMaterial);
    boot.position.set(side * 0.13, 0.06, 0.05);
    boot.castShadow = true;
    root.add(boot);
  }

  const eyeBase = hood.eyes.color.clone();

  const update = (time: number): void => {
    // Slow breathing and a slight weight shift.
    const breath = Math.sin(time * 1.4);
    body.scale.y = 1 + breath * 0.006;
    body.rotation.z = Math.sin(time * 0.5) * 0.008;
    hood.group.rotation.x = 0.04 + breath * 0.012;
    hood.group.rotation.y = Math.sin(time * 0.35) * 0.06;
    arm.group.rotation.x = breath * 0.01;

    cape.update(time);

    // Eyes flicker faintly.
    const flicker = 0.85 + 0.15 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
    hood.eyes.color.copy(eyeBase).multiplyScalar(flicker);
  };

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });

  return { root, arm, update };
}
