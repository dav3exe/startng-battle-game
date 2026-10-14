import * as THREE from 'three';
import { seeded } from './noise';

export interface Jungle {
  update: (time: number) => void;
}

const FOG_COLOR = 0x0a100d;

export function buildJungle(scene: THREE.Scene): Jungle {
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.055);

  const rand = seeded(7);

  // Uneven forest floor.
  const ground = new THREE.PlaneGeometry(90, 90, 160, 160);
  ground.rotateX(-Math.PI / 2);
  const gpos = ground.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < gpos.count; i++) {
    const x = gpos.getX(i);
    const z = gpos.getZ(i);
    const r = Math.hypot(x, z);
    const h = r < 12.5 ? 0 : (Math.sin(x * 0.7) * Math.cos(z * 0.6) + Math.sin(x * 2.3 + z * 1.7) * 0.3) * 0.18;
    gpos.setY(i, h);
  }
  ground.computeVertexNormals();
  const floor = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ color: 0x0d140f, roughness: 1 }));
  floor.receiveShadow = true;
  scene.add(floor);

  const dummy = new THREE.Object3D();
  const place = (minR: number, maxR: number): THREE.Vector2 => {
    const a = rand() * Math.PI * 2;
    const r = minR + rand() * (maxR - minR);
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  };

  // Tall trunks.
  const trunkCount = 70;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.42, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0x121612, roughness: 1 }),
    trunkCount,
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(2.6, 1),
    new THREE.MeshStandardMaterial({ color: 0x0c160f, roughness: 1, flatShading: true }),
    trunkCount * 2,
  );
  for (let i = 0; i < trunkCount; i++) {
    const p = place(13.5, 40);
    const scale = 0.7 + rand() * 0.8;
    dummy.position.set(p.x, 8 * scale - 0.5, p.y);
    dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI, (rand() - 0.5) * 0.08);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    for (let c = 0; c < 2; c++) {
      dummy.position.set(p.x + (rand() - 0.5) * 3, 13 * scale + c * 2, p.y + (rand() - 0.5) * 3);
      dummy.rotation.set(rand(), rand(), rand());
      const s = 1 + rand() * 1.2;
      dummy.scale.set(s, s * 0.6, s);
      dummy.updateMatrix();
      canopy.setMatrixAt(i * 2 + c, dummy.matrix);
    }
  }
  // Trunks stay out of the shadow map: their long moon shadows black out the clearing.
  trunks.castShadow = false;
  trunks.receiveShadow = true;
  scene.add(trunks, canopy);

  // Dense undergrowth: broad leaves made from flattened cones.
  const leafCount = 320;
  const leaves = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.5, 1.4, 4, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x102018, roughness: 0.9, side: THREE.DoubleSide }),
    leafCount,
  );
  for (let i = 0; i < leafCount; i++) {
    const p = place(12.5, 32);
    dummy.position.set(p.x, 0.5, p.y);
    dummy.rotation.set((rand() - 0.5) * 1.2, rand() * Math.PI * 2, (rand() - 0.5) * 1.2);
    const s = 0.6 + rand() * 1.4;
    dummy.scale.set(s * 1.6, s, s * 0.25);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  leaves.receiveShadow = true;
  scene.add(leaves);

  // Hanging vines.
  const vineCount = 50;
  const vines = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.015, 0.015, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0x0f1a12, roughness: 1 }),
    vineCount,
  );
  for (let i = 0; i < vineCount; i++) {
    const p = place(13, 26);
    const length = 3 + rand() * 7;
    dummy.position.set(p.x, 12 - length / 2, p.y);
    dummy.rotation.set((rand() - 0.5) * 0.1, 0, (rand() - 0.5) * 0.1);
    dummy.scale.set(1, length, 1);
    dummy.updateMatrix();
    vines.setMatrixAt(i, dummy.matrix);
  }
  scene.add(vines);

  // Lighting: cold moonlight from behind, a low red rim light, very little fill.
  scene.add(new THREE.HemisphereLight(0x2c4048, 0x070908, 0.9));

  const moon = new THREE.DirectionalLight(0xa9c8da, 3.2);
  moon.position.set(-5, 12, -7);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -14;
  moon.shadow.camera.right = 14;
  moon.shadow.camera.top = 14;
  moon.shadow.camera.bottom = -14;
  moon.shadow.bias = -0.0005;
  scene.add(moon);

  const rim = new THREE.PointLight(0xa0160f, 9, 8, 1.4);
  rim.position.set(1.8, 1.9, -1.6);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x6a8494, 1.1);
  fill.position.set(2, 3, 6);
  scene.add(fill);

  // Drifting embers.
  const emberCount = 260;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberSpeed = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    const p = place(0.6, 14);
    emberPositions[i * 3] = p.x;
    emberPositions[i * 3 + 1] = rand() * 6;
    emberPositions[i * 3 + 2] = p.y;
    emberSpeed[i] = 0.08 + rand() * 0.25;
  }
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  const embers = new THREE.Points(
    emberGeometry,
    new THREE.PointsMaterial({
      color: 0xff3a1c,
      size: 0.035,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(embers);

  let last = 0;
  const update = (time: number): void => {
    const dt = Math.min(time - last, 0.1);
    last = time;
    const attr = emberGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < emberCount; i++) {
      let y = attr.getY(i) + (emberSpeed[i] ?? 0.1) * dt;
      if (y > 6) y = 0;
      attr.setY(i, y);
      attr.setX(i, attr.getX(i) + Math.sin(time * 0.7 + i) * 0.002);
    }
    attr.needsUpdate = true;
    rim.intensity = 9 + Math.sin(time * 2.3) * 0.8;
  };

  return { update };
}
