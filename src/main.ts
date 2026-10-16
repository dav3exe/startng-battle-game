import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HOODED_SWORDSMAN } from './character/character-spec';
import { createHoodedSwordsman } from './character/hooded-swordsman';
import { findAimPoint } from './game/aim';
import { COMBAT_RULES } from './game/combat-rules';
import type { Damageable } from './game/combat-types';
import { Input } from './game/input';
import { Player } from './game/player';
import { Projectiles } from './game/projectiles';
import { ThirdPersonCamera } from './game/third-person-camera';
import { TrainingDummy } from './game/training-dummy';
import { TUNING } from './game/tuning';
import { Horde } from './horde/horde';
import { buildJungle } from './scene/jungle';
import { cleanSessionFromAddress, signInUrl } from './startng/connect';
import { readBoard, saveRun } from './startng/leaderboard';
import { FALLBACK_STYLE, fetchPlayer, type StartNgPlayer } from './startng/player-style';
import { HordeHud } from './ui/horde-hud';
import { Hud } from './ui/hud';
import { ProfileCard } from './ui/profile-card';

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
// The dummy in the training ground; the horde's zombies during a run. Refilled every frame.
const targets: Damageable[] = [dummy];
// How far above him the greatsword still reaches: flyers circle out of reach until they swoop.
const MELEE_REACH_UP = 1.5;

const projectiles = new Projectiles(scene, (event) => hud.spawnDamage(event.at, event.amount));

const player = new Player(model, {
  fireBolt: (origin, direction) => projectiles.fireBolt(origin, direction),
  fireCannon: (origin, direction) => projectiles.fireCannon(origin, direction),
  melee: (origin, facing) => {
    for (const target of targets) {
      if (!target.alive) continue;
      if (target.position.y - origin.y > MELEE_REACH_UP) continue;
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

// The horde: the player's start.ng character, risen as zombies, in waves.
cleanSessionFromAddress();
let startNgPlayer: StartNgPlayer | null = null;
const signIn = (): void => {
  location.href = signInUrl();
};
const profileCard = new ProfileCard(signIn);
const startHorde = (): void => {
  if (!horde.canStart) return;
  horde.start(player);
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock()?.catch(() => undefined);
  }
};
const hordeHud = new HordeHud({ start: startHorde, signIn });
const horde = new Horde(scene, FALLBACK_STYLE, {
  waveStarted: (wave) => {
    if (wave === 1) hordeHud.runStarted();
    hordeHud.waveStarted(wave);
  },
  waveCleared: (wave) => hordeHud.waveCleared(wave),
  playerHit: (amount) => {
    hordeHud.playerHit();
    hud.spawnDamage(player.position.clone().setY(player.position.y + 1.2), amount);
  },
  runEnded: (stats) => {
    hordeHud.runEnded(stats.waves, stats.kills, horde.wave);
    // Free the mouse so the results panel (and sign-in) can be clicked.
    window.setTimeout(() => {
      if (!horde.running) document.exitPointerLock();
    }, 1500);
    if (!startNgPlayer?.signedIn) return;
    void saveRun(stats).then((result) => {
      hordeHud.setSaveMessage(result.message);
      void refreshBoard();
    });
  },
});

const refreshBoard = async (): Promise<void> => {
  hordeHud.setBoard(await readBoard(10));
};
// Ask again when the player comes back: they may have signed in or out on start.ng.
const refreshPlayer = async (): Promise<void> => {
  const next = await fetchPlayer();
  const changed = JSON.stringify(next) !== JSON.stringify(startNgPlayer);
  startNgPlayer = next;
  if (!changed) return;
  profileCard.set(next);
  hordeHud.setPlayer(next);
  horde.setStyle(next?.style ?? FALLBACK_STYLE);
};
void refreshPlayer().then(refreshBoard);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshPlayer();
});
window.addEventListener('focus', () => void refreshPlayer());

// Enter, or Options / Start on a controller, starts a run.
let padStartWasDown = false;
const PAD_OPTIONS = 9;
window.addEventListener('keydown', (event) => {
  if (event.code === 'Enter' || event.code === 'NumpadEnter') startHorde();
});

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

  const rawFrame = input.frame(dt, TUNING.camera.mouseSensitivity, TUNING.camera.stickSensitivity);
  // Knocked down: he can look around but not act until the training ground comes back.
  const frame = horde.playerDown
    ? { ...rawFrame, move: { x: 0, y: 0 }, sprint: false, light: false, heavy: false, special: false, dodge: false, jump: false }
    : rawFrame;
  const playing = input.pointerLocked || frame.usingGamepad;

  const pad = navigator.getGamepads ? Array.from(navigator.getGamepads()).find((p) => p !== null) : undefined;
  const padStartDown = pad?.buttons[PAD_OPTIONS]?.pressed ?? false;
  if (padStartDown && !padStartWasDown) startHorde();
  padStartWasDown = padStartDown;

  targets.length = 0;
  if (horde.running) targets.push(...horde.targets);
  else targets.push(dummy);
  dummy.root.visible = !horde.running;
  followCamera.forward(cameraForward);
  // What the red dot is on. Anything between the camera and him is ignored.
  aimRay.origin.copy(camera.position);
  camera.getWorldDirection(aimRay.direction);
  findAimPoint(aimRay, targets, camera.position.distanceTo(player.position), TUNING.camera.aimRange, aimPoint);
  player.update(dt, now, frame, cameraForward, aimPoint);
  followCamera.update(dt, player.position, frame.look);

  dummy.update(dt, now);
  // The horde holds still while the mouse is released, so nobody gets eaten mid-menu.
  if (playing || !horde.running) horde.update(dt, now, player);
  projectiles.update(dt, targets);
  jungle.update(now);

  hud.update(dt, {
    camera,
    playerHealth: player.health,
    specialLeftS: player.specialCooldownLeft(now),
    usingGamepad: frame.usingGamepad,
    pointerLocked: input.pointerLocked,
    dummy: { position: dummy.position, height: dummy.height, health: dummy.health, alive: dummy.alive && !horde.running },
  });
  hordeHud.update(dt, { camera, horde, playing });

  composer.render();
});
