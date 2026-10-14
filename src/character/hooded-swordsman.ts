import * as THREE from 'three';
import type { CharacterSpec } from './character-spec';
import { createCape, createCloak, createHood, createMantle } from './cloth';
import { createGreatsword, createIronArm, type IronArm } from './weapons';

// What the character is doing this frame; the model turns it into a pose.
export interface Pose {
  moveSpeed: number; // 0 still, 1 walking, ~1.7 sprinting
  aim: number; // 0..1 crossbow raised
  recoil: number; // 0..1 kick after a bolt or the cannon
  cannon: number; // 0..1 crossbow limbs folded open
  swing: number | null; // 0..1 through the greatsword swing, null when not swinging
  dodge: number | null; // 0..1 through the dodge, null when not dodging
}

export const IDLE_POSE: Pose = { moveSpeed: 0, aim: 0, recoil: 0, cannon: 0, swing: null, dodge: null };

export interface CharacterModel {
  root: THREE.Group;
  arm: IronArm;
  update: (time: number, pose: Pose) => void;
}

const ease = (t: number): number => t * t * (3 - 2 * t);
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

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
  const backSword = createGreatsword(spec.colors);
  backSword.position.set(-0.08, 1.5, -0.42);
  backSword.rotation.set(0.12, 0, 0.46);
  body.add(backSword);

  // Right arm and a second sword, shown only while swinging.
  const swingRig = new THREE.Group();
  swingRig.position.set(-0.34, 1.36, 0.04);
  swingRig.rotation.order = 'YXZ';
  swingRig.visible = false;
  body.add(swingRig);

  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.075, 0.56, 12),
    new THREE.MeshStandardMaterial({ color: spec.colors.cloak, roughness: 0.9 }),
  );
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = 0.28;
  swingRig.add(sleeve);

  const gauntlet = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 10),
    new THREE.MeshStandardMaterial({ color: spec.colors.metal, metalness: 0.85, roughness: 0.4 }),
  );
  gauntlet.position.z = 0.58;
  swingRig.add(gauntlet);

  const handSword = createGreatsword(spec.colors);
  handSword.position.z = 0.6;
  // Blade points forward with its flat side vertical, so the edge leads the swing.
  handSword.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
  swingRig.add(handSword);

  // Iron left arm comes out of the cloak with the crossbow raised.
  const arm = createIronArm(spec.colors);
  const armRest = new THREE.Vector3(0.36, 1.32, 0.05);
  arm.group.position.copy(armRest);
  arm.group.rotation.z = 0.08;
  body.add(arm.group);

  const bootMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.7, metalness: 0.2 });
  const boots: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.26), bootMaterial);
    boot.position.set(side * 0.13, 0.06, 0.05);
    root.add(boot);
    boots.push(boot);
  }

  const eyeBase = hood.eyes.color.clone();

  const update = (time: number, pose: Pose): void => {
    const breath = Math.sin(time * 1.4);
    const moving = Math.min(pose.moveSpeed, 1.8);
    const stride = time * (7 + moving * 2.5);

    // Walk bob and forward lean.
    body.position.y = Math.abs(Math.sin(stride)) * 0.035 * Math.min(moving, 1);
    body.rotation.x = 0.1 * Math.min(moving, 1.5);
    body.rotation.y = 0;
    body.rotation.z = Math.sin(time * 0.5) * 0.008 + Math.sin(stride) * 0.02 * Math.min(moving, 1);
    body.scale.y = 1 + breath * 0.006;
    boots.forEach((boot, i) => {
      const phase = stride + (i === 0 ? 0 : Math.PI);
      boot.position.z = 0.05 + Math.sin(phase) * 0.18 * Math.min(moving, 1.2);
    });

    hood.group.rotation.x = 0.04 + breath * 0.012;
    hood.group.rotation.y = Math.sin(time * 0.35) * 0.06 * (1 - Math.min(moving, 1));

    // Crossbow arm: raise to aim, kick back on each shot.
    arm.group.rotation.x = -pose.aim * 0.3 + breath * 0.01;
    arm.group.position.copy(armRest);
    arm.group.position.z -= pose.recoil * 0.06;
    arm.setCannonOpen(pose.cannon);

    // Greatsword swing: wind up to the right, cut across to the left.
    if (pose.swing !== null) {
      const p = pose.swing;
      let yaw: number;
      let raise: number;
      if (p < 0.35) {
        const a = ease(p / 0.35);
        yaw = THREE.MathUtils.lerp(-0.3, -2.0, a);
        raise = THREE.MathUtils.lerp(0, 0.55, a);
      } else if (p < 0.55) {
        const b = easeOut((p - 0.35) / 0.2);
        yaw = THREE.MathUtils.lerp(-2.0, 1.7, b);
        raise = THREE.MathUtils.lerp(0.55, -0.15, b);
      } else {
        const c = ease((p - 0.55) / 0.45);
        yaw = THREE.MathUtils.lerp(1.7, 1.0, c);
        raise = THREE.MathUtils.lerp(-0.15, 0.1, c);
      }
      swingRig.rotation.set(-raise, yaw, 0);
      body.rotation.y = yaw * 0.18;
    }
    swingRig.visible = pose.swing !== null;
    backSword.visible = pose.swing === null;

    // Dodge: drop low and lunge.
    if (pose.dodge !== null) {
      const d = Math.sin(pose.dodge * Math.PI);
      body.position.y -= d * 0.45;
      body.rotation.x += d * 0.9;
    }

    cape.update(time, Math.min(moving / 1.7, 1) + (pose.dodge !== null ? 0.6 : 0));

    const flicker = 0.85 + 0.15 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
    hood.eyes.color.copy(eyeBase).multiplyScalar(flicker);
  };

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });

  return { root, arm, update };
}
