import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HOODED_SWORDSMAN } from './character/character-spec';
import { createHoodedSwordsman } from './character/hooded-swordsman';
import { findAimPoint } from './game/aim';
import { COMBAT_RULES } from './game/combat-rules';
import { Input } from './game/input';
import { Player } from './game/player';
import { Projectiles } from './game/projectiles';
import { ThirdPersonCamera } from './game/third-person-camera';
import { TrainingDummy } from './game/training-dummy';
import { TUNING } from './game/tuning';
import { buildJungle } from './scene/jungle';
import { Hud } from './ui/hud';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 2.5, -4);

const jungle = buildJungle(scene);
const model = createHoodedSwordsman(HOODED_SWORDSMAN);
scene.add(model.root);

const hud = new Hud(HOODED_SWORDSMAN);
const dummy = new TrainingDummy(scene, new THREE.Vector3(0, 0, 7));
const targets = [dummy];

const projectiles = new Projectiles(scene, (event) => hud.spawnDamage(event.at, event.amount));

const player = new Player(model, {
  fireBolt: (origin, direction) => projectiles.fireBolt(origin, direction),
  fireCannon: (origin, direction) => projectiles.fireCannon(origin, direction),
  melee: (origin, facing) => {
    for (const target of targets) {
      if (!target.alive) continue;
      const to = target.position.clone().sub(origin).setY(0);
      const distance = to.length();
      if (distance > TUNING.light.range + target.radius) continue;
      if (distance > 0.001 && to.normalize().dot(facing) < TUNING.light.arcCos) continue;
      target.takeDamage(COMBAT_RULES.light.damage);
      hud.spawnDamage(target.position.clone().setY(1.4), COMBAT_RULES.light.damage);
    }
  },
});

const input = new Input(renderer.domElement);
const followCamera = new ThirdPersonCamera(camera);

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') dummy.strafing = !dummy.strafing;
});

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// High threshold: only the eyes, embers, bolts and the cannon bloom.
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.35, 0.95));
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const cameraForward = new THREE.Vector3();
const aimRay = new THREE.Ray();
const aimPoint = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = clock.elapsedTime;

  const frame = input.frame(dt, TUNING.camera.mouseSensitivity, TUNING.camera.stickSensitivity);
  followCamera.forward(cameraForward);
  // What the red dot is on. Anything between the camera and him is ignored.
  aimRay.origin.copy(camera.position);
  camera.getWorldDirection(aimRay.direction);
  findAimPoint(aimRay, targets, camera.position.distanceTo(player.position), TUNING.camera.aimRange, aimPoint);
  player.update(dt, now, frame, cameraForward, aimPoint);
  followCamera.update(dt, player.position, frame.look);

  dummy.update(dt, now);
  projectiles.update(dt, targets);
  jungle.update(now);

  hud.update(dt, {
    camera,
    playerHealth: player.health,
    specialLeftS: player.specialCooldownLeft(now),
    usingGamepad: frame.usingGamepad,
    pointerLocked: input.pointerLocked,
    dummy: { position: dummy.position, height: dummy.height, health: dummy.health, alive: dummy.alive },
  });

  composer.render();
});
