import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterStyle } from '../startng/player-style';

// The player's start.ng character, risen. The body is start.ng's own 3D person (ported from
// start.ng's Hangout, src/character.js, itself a copy of startng-fe src/three/human.ts), so it
// looks like the player's character on start.ng. On top of it: rotted skin, dirty torn clothes,
// a chest wound, claws, a hat knocked askew and glowing eyes. Faces +z, about 1.7-1.75 m tall.

export interface ZombieParts {
  root: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  // Height of the hip joint above the feet.
  pelvisY: number;
  // This zombie's own copies, so a hit flash only lights up the one that was hit.
  materials: THREE.MeshStandardMaterial[];
}

const PI = Math.PI;
const SHOE = '#2a211b';
const GOLD = '#e8b84a';
const LEATHER = '#6b4a2f';
const SCARF = '#c8442f';
const ROT = new THREE.Color(0x5d6b4a);
const DIRT = new THREE.Color(0x2b261f);

const V = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);

// A limb hanging down from its joint: tapered, slightly muscled, rounded at both ends.
function limbGeometry(rTop: number, rBot: number, len: number, bulge = 0): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = -PI / 2 + (i / 6) * (PI / 2);
    pts.push(V(Math.max(rBot * Math.cos(a), 0.0001), -len + rBot * Math.sin(a)));
  }
  for (let k = 1; k < 10; k++) {
    const t = k / 10;
    pts.push(V(rBot + (rTop - rBot) * t + bulge * Math.sin(PI * t), -len + len * t));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (PI / 2);
    pts.push(V(Math.max(rTop * Math.cos(a), 0.0001), rTop * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, 20);
}

// A sphere with a soft bumpy surface (for curly hair).
function curlyGeometry(r: number, amount: number): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(r, 40, 30);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 140) * Math.sin(v.y * 150) * Math.sin(v.z * 130);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Deterministic per style, so every zombie of one player is torn the same way.
function seededRandom(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// Builds one zombie in the player's style. Instances are cloned from it (shared geometry).
export function buildZombieTemplate(style: CharacterStyle): THREE.Group {
  const s = style;
  const rand = seededRandom(JSON.stringify(style));
  const female = s.body === 'female';
  const mats = new Map<string, THREE.MeshStandardMaterial>();

  const mat = (color: THREE.ColorRepresentation, metal = 0, rough = 0.7, key = ''): THREE.MeshStandardMaterial => {
    const id = `${new THREE.Color(color).getHexString()}|${metal}|${rough}|${key}`;
    let m = mats.get(id);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
      mats.set(id, m);
    }
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    return o;
  };
  const ball = (r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
    const o = mesh(new THREE.SphereGeometry(r, 20, 14), m, x, y, z);
    o.scale.set(sx, sy, sz);
    return o;
  };
  const group = (parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const limb = (rTop: number, rBot: number, len: number, m: THREE.Material, bulge = 0): THREE.Mesh =>
    mesh(limbGeometry(rTop, rBot, len, bulge), m);
  const lathe = (pts: Array<[number, number]>, m: THREE.Material, depth: number): THREE.Mesh => {
    const o = mesh(new THREE.LatheGeometry(pts.map(([r, y]) => V(Math.max(r, 0.0001), y)), 24), m);
    o.scale.z = depth;
    return o;
  };

  // Rotted skin and dirty clothes, in the player's own colours.
  const rotted = new THREE.Color(s.skinColor).lerp(ROT, 0.45).multiplyScalar(0.85);
  const skin = mat(rotted, 0, 0.75);
  const top = mat(new THREE.Color(s.primaryColor).lerp(DIRT, 0.35), 0, 0.9);
  const bottoms = mat(new THREE.Color(s.secondaryColor).lerp(DIRT, 0.35), 0, 0.95);
  const hair = mat(new THREE.Color(s.hairColor).lerp(new THREE.Color(0x3a3a34), 0.2), 0, 0.95);
  const shoe = mat(SHOE, 0, 0.6);
  const wound = mat(0x3a0d0a, 0, 0.5);
  const bone = mat(0xcfc6a8, 0, 0.7);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb8ff4a).multiplyScalar(2.5), toneMapped: false });
  glow.userData.noFlash = true;

  const root = new THREE.Group();
  root.name = 'zombie';
  root.rotation.order = 'YXZ';
  const hipY = female ? 0.885 : 0.91;
  root.userData.pelvisY = hipY;
  const hips = group(root, 'pelvis', 0, hipY, 0);

  // ---- pelvis (in the bottoms colour), then legs: hip > knee > ankle
  hips.add(
    lathe(
      female
        ? [[0, -0.1], [0.08, -0.098], [0.135, -0.08], [0.16, -0.04], [0.165, 0.0], [0.152, 0.05]]
        : [[0, -0.1], [0.08, -0.098], [0.13, -0.08], [0.15, -0.04], [0.152, 0.0], [0.146, 0.05]],
      bottoms,
      0.7,
    ),
  );
  const thighLen = female ? 0.41 : 0.42;
  const shinLen = female ? 0.395 : 0.405;
  // One trouser leg is torn away below the knee.
  const tornSide = rand() < 0.5 ? -1 : 1;
  for (const side of [-1, 1]) {
    const name = side === 1 ? 'L' : 'R';
    const hip = group(hips, `leg${name}`, side * (female ? 0.082 : 0.084), -0.04, 0);
    hip.add(limb(female ? 0.09 : 0.086, 0.056, thighLen - 0.06, bottoms, 0.01));
    const knee = group(hip, `shin${name}`, 0, -(thighLen - 0.06), 0);
    knee.add(limb(0.056, 0.04, shinLen, side === tornSide ? skin : bottoms, 0.012));
    if (side === tornSide) {
      // Ragged cuff where the trouser leg tore off.
      const cuff = mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.05, 10, 1, true), bottoms, 0, -0.02, 0);
      cuff.rotation.z = 0.15;
      knee.add(cuff);
    }
    const ankle = group(knee, `ankle${name}`, 0, -shinLen, 0);
    ankle.add(ball(0.05, shoe, 0, -0.03, 0.045, 0.95, 0.72, 2.3));
  }

  // ---- torso: one smooth shape from waist to collar
  const spine = group(hips, 'spine', 0, 0.03, 0);
  const depth = female ? 0.64 : 0.66;
  spine.add(
    lathe(
      female
        ? [[0.148, -0.05], [0.15, 0.0], [0.142, 0.06], [0.124, 0.13], [0.116, 0.19], [0.126, 0.25], [0.138, 0.31], [0.142, 0.36], [0.14, 0.4], [0.124, 0.44], [0.09, 0.47], [0.055, 0.49], [0.045, 0.5]]
        : [[0.142, -0.05], [0.144, 0.0], [0.142, 0.07], [0.14, 0.15], [0.146, 0.23], [0.162, 0.31], [0.176, 0.38], [0.176, 0.43], [0.16, 0.475], [0.12, 0.51], [0.066, 0.53], [0.052, 0.54]],
      top,
      depth,
    ),
  );
  if (female) {
    for (const side of [-1, 1]) spine.add(ball(0.058, top, side * 0.056, 0.325, 0.045, 1, 0.88, 0.75));
  }
  const shoulderY = female ? 0.42 : 0.455;
  const neckTop = female ? 0.6 : 0.645;
  spine.add(lathe([[0.05, neckTop - 0.16], [0.047, neckTop - 0.08], [0.044, neckTop - 0.02], [0.03, neckTop]], skin, 0.95));

  // Shirt hem hanging in torn strips all round the waist.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + rand() * 0.3;
    const length = 0.06 + rand() * 0.12;
    const strip = mesh(new THREE.BoxGeometry(0.035 + rand() * 0.03, length, 0.01), top, Math.sin(a) * 0.145, -0.05 - length / 2, Math.cos(a) * 0.145 * depth);
    strip.rotation.y = a;
    strip.rotation.z = (rand() - 0.5) * 0.4;
    spine.add(strip);
  }
  // Torn open on one side of the chest: a wound with ribs showing.
  const woundSide = rand() < 0.5 ? -1 : 1;
  const chestZ = (female ? 0.13 : 0.15) * depth;
  const gash = ball(0.05, wound, woundSide * 0.06, 0.24, chestZ, 1, 1.25, 0.3);
  spine.add(gash);
  for (let i = 0; i < 3; i++) {
    const rib = mesh(new THREE.CapsuleGeometry(0.006, 0.06, 2, 6), bone, woundSide * 0.06, 0.2 + i * 0.035, chestZ + 0.012);
    rib.rotation.z = PI / 2 + woundSide * 0.15;
    spine.add(rib);
  }

  // ---- arms: shoulder > elbow > hand, with one sleeve torn short
  const tornSleeve = rand() < 0.5 ? -1 : 1;
  for (const side of [-1, 1]) {
    const name = side === 1 ? 'L' : 'R';
    const sh = group(spine, `arm${name}`, side * (female ? 0.158 : 0.188), shoulderY, 0);
    sh.add(ball(female ? 0.054 : 0.062, top, 0, -0.012, 0, 1, 1, 0.92));
    sh.add(limb(female ? 0.045 : 0.052, 0.037, 0.29, skin, 0.004));
    sh.add(limb(female ? 0.058 : 0.067, female ? 0.051 : 0.058, side === tornSleeve ? 0.06 : 0.11, top));
    const elbow = group(sh, `fore${name}`, 0, -0.29, 0);
    elbow.add(limb(0.037, 0.027, 0.245, skin, 0.006));
    const hand = group(elbow, `hand${name}`, 0, -0.265, 0.004);
    hand.add(ball(0.029, skin, 0, -0.03, 0, 1, 1.55, 0.55));
    const thumb = ball(0.012, skin, side * -0.022, -0.02, 0.012, 1, 2, 1);
    thumb.rotation.z = side * 0.4;
    hand.add(thumb);
    // Claws.
    for (let f = -1; f <= 1; f++) {
      const claw = mesh(new THREE.ConeGeometry(0.006, 0.035, 5), bone, f * 0.012, -0.085, 0.004);
      claw.rotation.x = PI;
      hand.add(claw);
    }
  }

  // ---- head: start.ng's face, with glowing eyes and a slack jaw
  const head = group(spine, 'head', 0, female ? 0.672 : 0.718, 0);
  head.scale.setScalar(1.05);
  const sx = female ? 0.84 : 0.88;
  head.add(ball(0.1, skin, 0, 0, 0, sx, 1.13, 1));
  head.add(ball(0.07, skin, 0, -0.058, 0.02, female ? 0.9 : 1.0, 0.8, 0.95));
  const sunken = mat(new THREE.Color(rotted).multiplyScalar(0.45), 0, 0.9);
  for (const side of [-1, 1]) {
    head.add(ball(0.022, skin, side * 0.087 * (sx / 0.88), -0.005, -0.004, 0.45, 1, 0.75));
    // Dark sunken socket with a glowing eye in it.
    head.add(ball(0.019, sunken, side * 0.034, 0.012, 0.078, 1.3, 0.85, 0.6));
    head.add(ball(0.011, glow, side * 0.034, 0.012, 0.088));
    const brow = ball(0.018, hair, side * 0.036, 0.04, 0.088, 1.25, female ? 0.22 : 0.32, 0.4);
    brow.rotation.z = side * (female ? -0.18 : -0.06);
    head.add(brow);
  }
  head.add(ball(0.016, skin, 0, -0.01, 0.098, 0.85, 1.5, 1.1));
  head.add(ball(0.012, skin, 0, -0.028, 0.104, 1.2, 0.7, 0.9));
  // Mouth hangs open.
  head.add(ball(0.022, wound, 0, -0.058, 0.084, 1, 0.65, 0.5));

  // hair
  if (s.hair !== 'bald') {
    const cap = mesh(new THREE.SphereGeometry(0.106, 24, 12, 0, 2 * PI, 0, PI * 0.5), hair, 0, 0.012, -0.012);
    cap.scale.set(sx + 0.02, 1.15, 1.03);
    cap.rotation.x = -0.42;
    head.add(cap);
  }
  if (s.hair === 'afro') {
    const a = mesh(curlyGeometry(0.16, 0.045), hair, 0, 0.06, -0.065);
    a.scale.set(1.02, 0.9, 0.85);
    head.add(a);
  }
  if (s.hair === 'bun') head.add(mesh(curlyGeometry(0.052, 0.03), hair, 0, 0.11, -0.075));
  if (s.hair === 'ponytail') {
    const tail = group(head, 'ponytail', 0, 0.03, -0.1);
    tail.add(ball(0.026, hair));
    const strand = limb(0.04, 0.016, 0.26, hair, 0.01);
    strand.rotation.x = 0.15;
    tail.add(strand);
  }
  if (s.hair === 'braids' || s.hair === 'dreads') {
    const braids = s.hair === 'braids';
    const n = braids ? 16 : 18;
    const len = braids ? 0.34 : 0.21;
    for (let i = 0; i < n; i++) {
      const a = PI * 0.1 + (i / (n - 1)) * PI * 0.8;
      // Matted: some strands longer, some torn short.
      const strandLen = len * (0.6 + rand() * 0.5);
      const strand = limb(braids ? 0.011 : 0.014, braids ? 0.008 : 0.012, strandLen, hair);
      strand.position.set(Math.cos(a) * 0.086 * (sx / 0.88), 0.02, -Math.sin(a) * 0.09);
      strand.rotation.z = Math.cos(a) * 0.12;
      strand.rotation.x = 0.1;
      head.add(strand);
    }
  }

  // face extras
  if (s.accessory === 'beard') {
    const beard = mesh(new THREE.SphereGeometry(0.104, 24, 12, 0, 2 * PI, PI * 0.66, PI * 0.34), hair, 0, -0.008, 0.006);
    beard.scale.set(sx + 0.02, 1.12, 1.02);
    head.add(beard);
    head.add(ball(0.03, hair, 0, -0.035, 0.088, 1.3, 0.35, 0.5));
  }
  if (s.accessory === 'glasses') {
    const frame = mat('#1d1b19', 0.4, 0.35);
    for (const side of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.024, 0.0042, 8, 20), frame, side * 0.035, 0.012, 0.1);
      // One side has slipped.
      if (side === 1) {
        ring.position.y -= 0.01;
        ring.rotation.z = 0.35;
      }
      head.add(ring);
      head.add(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), frame, side * 0.083 * (sx / 0.88), 0.014, 0.05));
    }
    head.add(mesh(new THREE.TorusGeometry(0.011, 0.0035, 8, 16, PI), frame, 0, 0.014, 0.102));
  }
  if (s.accessory === 'earrings') {
    for (const side of [-1, 1]) {
      head.add(mesh(new THREE.TorusGeometry(0.012, 0.0032, 8, 16), mat(GOLD, 0.85, 0.4), side * 0.086 * (sx / 0.88), -0.04, 0.004));
    }
  }

  // hats sit higher on an afro, and every one is knocked askew
  const lift = s.hair === 'afro' ? 0.075 : 0;
  const hat = group(head, 'hat', 0, 0, 0);
  hat.rotation.z = 0.2;
  hat.rotation.x = -0.08;
  if (s.hat === 'cap') {
    const dome = mesh(new THREE.SphereGeometry(0.112, 24, 10, 0, 2 * PI, 0, PI / 2), top, 0, 0.018 + lift, -0.006);
    dome.scale.set(sx + 0.05, 1.18, 1.08);
    hat.add(dome);
    const brim = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 20, 1, false, -PI / 2, PI), top, 0, 0.03 + lift, 0.085);
    brim.scale.set(1, 1, 0.9);
    brim.rotation.x = 0.12;
    hat.add(brim);
  }
  if (s.hat === 'beanie') {
    const dome = mesh(new THREE.SphereGeometry(0.114, 24, 10, 0, 2 * PI, 0, PI / 2), top, 0, 0.022 + lift, -0.004);
    dome.scale.set(sx + 0.05, 1.05, 1.07);
    hat.add(dome);
    const cuff = mesh(new THREE.TorusGeometry(0.1, 0.02, 10, 28), bottoms, 0, 0.03 + lift, -0.004);
    cuff.rotation.x = PI / 2;
    cuff.scale.set(sx + 0.06, 1.08, 1);
    hat.add(cuff);
    hat.add(mesh(curlyGeometry(0.03, 0.06), top, 0, 0.152 + lift, -0.01));
  }
  if (s.hat === 'tophat') {
    const black = mat('#1b1a18', 0, 0.6);
    const h = group(hat, 'tophat', 0, 0.1 + lift, -0.005);
    h.rotation.z = -0.08;
    h.add(mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.012, 24), black));
    // Crumpled crown.
    const crown = mesh(new THREE.CylinderGeometry(0.085, 0.092, 0.17, 24), black, 0, 0.09, 0);
    crown.rotation.x = 0.12;
    h.add(crown);
    h.add(mesh(new THREE.CylinderGeometry(0.094, 0.094, 0.03, 24), top, 0, 0.025, 0));
  }
  if (s.hat === 'crown') {
    const gold = mat(GOLD, 0.85, 0.5);
    const c = group(hat, 'crown', 0, 0.1 + lift, -0.005);
    c.add(mesh(new THREE.CylinderGeometry(0.085, 0.08, 0.05, 24, 1, true), gold));
    for (let i = 0; i < 6; i++) {
      // A couple of points snapped off.
      if (i === 2 || i === 5) continue;
      const a = (i / 6) * PI * 2;
      c.add(mesh(new THREE.ConeGeometry(0.018, 0.05, 10), gold, Math.sin(a) * 0.08, 0.045, Math.cos(a) * 0.08));
      c.add(ball(0.007, gold, Math.sin(a) * 0.08, 0.072, Math.cos(a) * 0.08));
    }
    c.add(mesh(new THREE.OctahedronGeometry(0.012), mat('#d6263b', 0.2, 0.15), 0, 0.005, 0.086));
  }

  // body extras
  if (s.accessory === 'scarf') {
    const sc = mat(new THREE.Color(SCARF).lerp(DIRT, 0.35), 0, 0.95);
    const ring = mesh(new THREE.TorusGeometry(0.066, 0.03, 12, 24), sc, 0, neckTop - 0.13, 0.005);
    ring.rotation.x = PI / 2 - 0.15;
    ring.scale.set(1.08, 0.85, 1);
    spine.add(ring);
    const tail = mesh(new THREE.CapsuleGeometry(0.026, 0.16, 6, 10), sc, 0.06, neckTop - 0.25, 0.08);
    tail.scale.z = 0.45;
    tail.rotation.z = 0.08;
    spine.add(tail);
  }
  if (s.accessory === 'backpack') {
    const lea = mat(new THREE.Color(LEATHER).lerp(DIRT, 0.3), 0, 0.8);
    const zBack = female ? -0.1 : -0.115;
    const bag = mesh(new THREE.CapsuleGeometry(0.11, 0.12, 8, 14), lea, 0, 0.3, zBack - 0.06);
    bag.scale.set(1.15, 1, 0.55);
    bag.rotation.z = 0.18;
    spine.add(bag);
    const pocket = mesh(new THREE.CapsuleGeometry(0.07, 0.03, 6, 12), mat('#57391f', 0, 0.8), 0, 0.22, zBack - 0.12);
    pocket.scale.set(1.2, 1, 0.35);
    spine.add(pocket);
    // One strap has snapped; the other still holds.
    const strap = mesh(new THREE.CapsuleGeometry(0.012, 0.32, 4, 8), lea, 0.085, 0.29, female ? 0.082 : 0.093);
    strap.scale.x = 1.6;
    strap.rotation.x = -0.12;
    spine.add(strap);
    const over = mesh(new THREE.TorusGeometry(0.09, 0.011, 8, 16, PI), lea, 0.085, shoulderY - 0.03, -0.01);
    over.rotation.y = PI / 2;
    spine.add(over);
  }

  // Ragged bat wings, shown only on flyers.
  const wingSkin = mat(new THREE.Color(rotted).multiplyScalar(0.6), 0, 0.9, 'wing');
  wingSkin.side = THREE.DoubleSide;
  const wingShape = new THREE.Shape();
  const outline: Array<[number, number]> = [
    [0.25, 0.12], [0.6, 0.2], [0.95, 0.05], [0.8, -0.12], [0.7, -0.05], [0.55, -0.26], [0.42, -0.1], [0.3, -0.3], [0.15, -0.12], [0, -0.2],
  ];
  wingShape.moveTo(0, 0);
  for (const [x, y] of outline) wingShape.lineTo(x, y);
  wingShape.closePath();
  const wingGeometry = new THREE.ShapeGeometry(wingShape);
  for (const side of [-1, 1]) {
    const wing = group(spine, `wing${side === 1 ? 'L' : 'R'}`, side * 0.06, shoulderY - 0.02, -0.1);
    wing.scale.x = side;
    wing.visible = false;
    wing.add(mesh(wingGeometry, wingSkin));
    const spar = mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.98, 5), bone, 0.48, 0.12, 0);
    spar.rotation.z = PI / 2 - 0.15;
    wing.add(spar);
  }

  mergeByJoint(root);
  return root;
}

// start.ng's person is ~150 small meshes. Each joint's meshes are merged into one per material,
// so a dozen zombies stay a few hundred draw calls instead of a few thousand.
function mergeByJoint(root: THREE.Object3D): void {
  const joints: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Group || o === root) joints.push(o);
  });
  for (const joint of joints) {
    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of joint.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const material = child.material as THREE.Material;
      const list = byMaterial.get(material) ?? [];
      list.push(child);
      byMaterial.set(material, list);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        g.applyMatrix4(m.matrix);
        return g;
      });
      const merged = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (!merged) continue;
      for (const m of meshes) {
        joint.remove(m);
        m.geometry.dispose();
      }
      const one = new THREE.Mesh(merged, material);
      one.castShadow = true;
      joint.add(one);
    }
  }
}

function need(root: THREE.Object3D, name: string): THREE.Group {
  const found = root.getObjectByName(name);
  if (!(found instanceof THREE.Group)) throw new Error(`Zombie template is missing ${name}`);
  return found;
}

// A new zombie from the template: shared geometry, its own materials.
export function instantiateZombie(template: THREE.Group, wings: boolean): ZombieParts {
  const root = template.clone(true);
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.Material;
    if (!(material instanceof THREE.MeshStandardMaterial) || material.userData.noFlash) return;
    let copy = copies.get(material);
    if (!copy) {
      copy = material.clone();
      copies.set(material, copy);
    }
    child.material = copy;
  });

  const parts: ZombieParts = {
    root,
    pelvis: need(root, 'pelvis'),
    spine: need(root, 'spine'),
    head: need(root, 'head'),
    armL: need(root, 'armL'),
    armR: need(root, 'armR'),
    foreL: need(root, 'foreL'),
    foreR: need(root, 'foreR'),
    legL: need(root, 'legL'),
    legR: need(root, 'legR'),
    shinL: need(root, 'shinL'),
    shinR: need(root, 'shinR'),
    wingL: need(root, 'wingL'),
    wingR: need(root, 'wingR'),
    pelvisY: typeof template.userData.pelvisY === 'number' ? template.userData.pelvisY : 0.9,
    materials: [...copies.values()],
  };
  parts.wingL.visible = wings;
  parts.wingR.visible = wings;
  return parts;
}

export function disposeZombie(parts: ZombieParts): void {
  for (const material of parts.materials) material.dispose();
}
