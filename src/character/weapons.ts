import * as THREE from 'three';

interface WeaponColors {
  metal: number;
  blade: number;
  leather: number;
}

// Huge slab of a greatsword. Origin is the cross-guard: grip points up (+y), blade points down.
export function createGreatsword(colors: WeaponColors): THREE.Group {
  const group = new THREE.Group();
  const length = 1.62;
  const half = 0.15;

  // Blade outline, drawn tip-down, with nicks along both edges from use.
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, -0.52);
  shape.lineTo(half - 0.025, -0.56);
  shape.lineTo(half, -0.6);
  shape.lineTo(half, -1.12);
  shape.lineTo(half - 0.02, -1.15);
  shape.lineTo(half, -1.19);
  shape.lineTo(half, -length + 0.18);
  shape.lineTo(0.02, -length);
  shape.lineTo(-half, -length + 0.06);
  shape.lineTo(-half, -0.86);
  shape.lineTo(-half + 0.03, -0.82);
  shape.lineTo(-half, -0.78);
  shape.lineTo(-half, 0);

  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
    }),
    new THREE.MeshStandardMaterial({ color: colors.blade, metalness: 0.85, roughness: 0.42 }),
  );
  blade.position.z = -0.0175;
  blade.castShadow = true;
  group.add(blade);

  const iron = new THREE.MeshStandardMaterial({ color: colors.metal, metalness: 0.9, roughness: 0.38 });
  const leather = new THREE.MeshStandardMaterial({ color: colors.leather, roughness: 0.8 });

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.09), iron);
  guard.castShadow = true;
  group.add(guard);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.42, 14), leather);
  grip.position.y = 0.24;
  group.add(grip);

  // Leather wraps on the grip.
  for (let i = 0; i < 6; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 16), leather);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = 0.07 + i * 0.065;
    group.add(wrap);
  }

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 12), iron);
  pommel.position.y = 0.47;
  group.add(pommel);

  return group;
}

export interface IronArm {
  group: THREE.Group;
  // Where bolts and the cannon shot leave the arm.
  boltMuzzle: THREE.Object3D;
  cannonMuzzle: THREE.Object3D;
  // The crossbow limbs fold open when the cannon fires (special attack).
  setCannonOpen: (amount: number) => void;
}

// Iron prosthetic left arm with a repeating crossbow on the forearm and a cannon at the wrist.
export function createIronArm(colors: WeaponColors): IronArm {
  const group = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: colors.metal, metalness: 0.92, roughness: 0.36 });
  const darkIron = new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.8, roughness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: colors.leather, roughness: 0.75 });

  // Upper arm, mostly hidden by the cloak.
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.3, 14), iron);
  upper.position.y = -0.15;
  upper.castShadow = true;
  group.add(upper);

  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), darkIron);
  elbow.position.y = -0.3;
  group.add(elbow);

  // Forearm held forward, ready to fire.
  const forearm = new THREE.Group();
  forearm.position.y = -0.3;
  forearm.rotation.x = -0.25;
  group.add(forearm);

  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.34, 14), iron);
  fore.rotation.x = Math.PI / 2;
  fore.position.z = 0.17;
  fore.castShadow = true;
  forearm.add(fore);

  // Plate bands and rivets.
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), darkIron);
    band.position.z = 0.05 + i * 0.11;
    forearm.add(band);
    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI * 2;
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), iron);
      rivet.position.set(Math.cos(a) * 0.064, Math.sin(a) * 0.064, 0.05 + i * 0.11);
      forearm.add(rivet);
    }
  }

  // Crossbow stock along the top of the forearm.
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.4), wood);
  stock.position.set(0, 0.075, 0.2);
  stock.castShadow = true;
  forearm.add(stock);

  // Bolt magazine with three bolts loaded.
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.11), darkIron);
  magazine.position.set(0, 0.125, 0.13);
  forearm.add(magazine);
  for (let i = -1; i <= 1; i++) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 6), iron);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(i * 0.02, 0.165, 0.17);
    forearm.add(bolt);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 6), iron);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(i * 0.02, 0.165, 0.285);
    forearm.add(tip);
  }

  // Limbs: two halves that swing open for the cannon.
  const limbMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4e55, metalness: 0.85, roughness: 0.4 });
  const limbs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.075, 0.38);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.12, 0.01, -0.03),
      new THREE.Vector3(side * 0.22, 0.0, -0.09),
    ]);
    const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012, 8, false), limbMaterial);
    limb.castShadow = true;
    pivot.add(limb);
    forearm.add(pivot);
    limbs.push(pivot);
  }

  const string = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.22, 0.075, 0.29),
      new THREE.Vector3(0, 0.08, 0.22),
      new THREE.Vector3(0.22, 0.075, 0.29),
    ]),
    new THREE.LineBasicMaterial({ color: 0x8a9097 }),
  );
  forearm.add(string);

  // Cannon barrel at the wrist, under the crossbow.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.1, 18, 1, true), darkIron);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, 0.38);
  forearm.add(barrel);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.03, 18), new THREE.MeshBasicMaterial({ color: 0x050303 }));
  bore.position.set(0, 0, 0.42);
  forearm.add(bore);

  const boltMuzzle = new THREE.Object3D();
  boltMuzzle.position.set(0, 0.08, 0.44);
  forearm.add(boltMuzzle);
  const cannonMuzzle = new THREE.Object3D();
  cannonMuzzle.position.set(0, 0, 0.46);
  forearm.add(cannonMuzzle);

  const setCannonOpen = (amount: number): void => {
    const t = THREE.MathUtils.clamp(amount, 0, 1);
    limbs.forEach((pivot, index) => {
      const side = index === 0 ? -1 : 1;
      pivot.rotation.y = side * -t * 1.2;
    });
    string.visible = t < 0.1;
  };

  return { group, boltMuzzle, cannonMuzzle, setCannonOpen };
}
