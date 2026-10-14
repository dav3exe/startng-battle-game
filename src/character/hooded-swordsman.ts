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
  swing: number | null; // 0..1 through the greatsword slash, null when not slashing
  swingSide: 1 | -1; // 1 forehand (his right to left), -1 the return cut
  dodge: number | null; // 0..1 through the dash, null when not dashing
  roll: number | null; // 0..1 through the roll that follows a double-tapped dash
  air: number; // 0 on the ground, 1 at the top of a jump
}

export const IDLE_POSE: Pose = { moveSpeed: 0, aim: 0, recoil: 0, cannon: 0, swing: null, swingSide: 1, dodge: null, roll: null, air: 0 };

export interface CharacterModel {
  root: THREE.Group;
  arm: IronArm;
  update: (time: number, pose: Pose) => void;
}

const ease = (t: number): number => t * t * (3 - 2 * t);
const easeIn = (t: number): number => t * t;
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

// Height (before the tuck) he tumbles around during a roll.
const ROLL_PIVOT = 0.75;

// Length of the swoosh behind the edge, in radians of the cut.
const SLASH_TRAIL_RAD = 1.3;

interface SlashKey {
  at: number; // 0..1 through the slash
  yaw: number; // sweep angle of the arm in the plane of the cut
  twist: number; // torso turn that drives the cut
  lean: number; // forward lean into the cut
  curve: (t: number) => number; // easing into this key
}

// Forehand slash. The strike speeds up into contact (hit lands at ~0.42) and the
// follow-through carries past it, so the cut reads as heavy steel, not a wave.
const SLASH_KEYS: readonly SlashKey[] = [
  { at: 0, yaw: -0.7, twist: 0, lean: 0, curve: ease },
  { at: 0.24, yaw: -2.25, twist: -0.38, lean: -0.04, curve: easeOut },
  { at: 0.5, yaw: 1.6, twist: 0.45, lean: 0.2, curve: easeIn },
  { at: 0.66, yaw: 1.95, twist: 0.5, lean: 0.16, curve: easeOut },
  { at: 1, yaw: 1.1, twist: 0.08, lean: 0.02, curve: ease },
];

function slashKey(p: number): { yaw: number; twist: number; lean: number; trail: number } {
  let i = 1;
  while (i < SLASH_KEYS.length - 1 && (SLASH_KEYS[i]?.at ?? 1) < p) i++;
  const from = SLASH_KEYS[i - 1] ?? SLASH_KEYS[0];
  const to = SLASH_KEYS[i] ?? from;
  if (!from || !to) return { yaw: 0, twist: 0, lean: 0, trail: 0 };
  const span = Math.max(to.at - from.at, 1e-6);
  const t = to.curve(THREE.MathUtils.clamp((p - from.at) / span, 0, 1));
  // Swoosh only while the blade is moving fast: from the end of the wind-up to the follow-through.
  const strike = (p - 0.24) / (0.66 - 0.24);
  return {
    yaw: THREE.MathUtils.lerp(from.yaw, to.yaw, t),
    twist: THREE.MathUtils.lerp(from.twist, to.twist, t),
    lean: THREE.MathUtils.lerp(from.lean, to.lean, t),
    trail: strike > 0 && strike < 1 ? Math.sin(strike * Math.PI) : 0,
  };
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
  const backSword = createGreatsword(spec.colors);
  backSword.position.set(-0.08, 1.5, -0.42);
  backSword.rotation.set(0.12, 0, 0.46);
  body.add(backSword);

  // Right arm and a second sword, shown only while slashing. The outer group tilts the plane
  // of the cut (a diagonal slash); the inner rig sweeps the blade through that plane.
  const swingPlane = new THREE.Group();
  swingPlane.position.set(-0.34, 1.36, 0.04);
  // Tilted so the forehand runs from high on his right to low on his left.
  swingPlane.rotation.z = -0.5;
  body.add(swingPlane);

  const swingRig = new THREE.Group();
  swingRig.visible = false;
  swingPlane.add(swingRig);

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
  // Blade points along the arm with its flat lying in the swing plane, so the edge leads the cut.
  handSword.rotation.x = -Math.PI / 2;
  swingRig.add(handSword);

  // Faint swoosh that trails the edge through the fast part of the cut.
  const trailPivot = new THREE.Group();
  swingPlane.add(trailPivot);
  const trailMaterial = new THREE.MeshBasicMaterial({
    color: 0xc4d0d6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const trail = new THREE.Mesh(
    new THREE.RingGeometry(1.25, 2.2, 24, 1, -Math.PI / 2 - SLASH_TRAIL_RAD, SLASH_TRAIL_RAD),
    trailMaterial,
  );
  trail.rotation.x = -Math.PI / 2;
  trailPivot.add(trail);
  trailPivot.visible = false;

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
    body.scale.set(1, 1 + breath * 0.006, 1);
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

    // Greatsword slash: coil back, whip the edge through the target, follow through, recover.
    // The return cut is the same motion mirrored, so it rises from his left back to his right.
    if (pose.swing !== null) {
      const key = slashKey(pose.swing);
      swingPlane.scale.x = pose.swingSide;
      swingRig.rotation.y = key.yaw;
      body.rotation.y = key.twist * pose.swingSide;
      body.rotation.x += key.lean;
      body.position.z = key.lean * 0.5;

      trailPivot.rotation.y = key.yaw;
      trailPivot.visible = key.trail > 0;
      trailMaterial.opacity = key.trail * 0.32;
    } else {
      body.position.z = 0;
      trailPivot.visible = false;
    }
    swingRig.visible = pose.swing !== null;
    backSword.visible = pose.swing === null;

    // Dash: drop low and lunge.
    if (pose.dodge !== null) {
      const d = Math.sin(pose.dodge * Math.PI);
      body.position.y -= d * 0.25;
      body.rotation.x += d * 0.55;
    }

    // Roll after a double-tapped dash: tuck into a ball and tumble forward over a pivot
    // at hip height, so the head and cloak stay above the ground.
    if (pose.roll !== null) {
      const tuck = Math.sin(pose.roll * Math.PI);
      const angle = ease(pose.roll) * Math.PI * 2;
      const scale = 1 - 0.45 * tuck;
      const pivot = ROLL_PIVOT * scale;
      body.scale.setScalar(scale);
      body.rotation.set(angle, 0, 0);
      body.position.set(0, pivot * (1 - Math.cos(angle)) + 0.25 * tuck, -pivot * Math.sin(angle));
    }
    // Boots stay planted in his root, so hide them while he is balled up.
    boots.forEach((boot) => {
      boot.visible = pose.roll === null;
      boot.position.y = 0.06 + pose.air * 0.16;
    });
    // Knees up in the air.
    if (pose.roll === null) body.rotation.x -= pose.air * 0.12;

    const rushing = pose.dodge !== null || pose.roll !== null ? 0.6 : 0;
    cape.update(time, Math.min(moving / 1.7, 1) + rushing + pose.air * 0.4);

    const flicker = 0.85 + 0.15 * Math.sin(time * 7.3) * Math.sin(time * 3.1);
    hood.eyes.color.copy(eyeBase).multiplyScalar(flicker);
  };

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true;
  });

  return { root, arm, update };
}
