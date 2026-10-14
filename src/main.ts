import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HOODED_SWORDSMAN } from './character/character-spec';
import { createHoodedSwordsman } from './character/hooded-swordsman';
import { buildJungle } from './scene/jungle';
import { createOverlay } from './ui/overlay';

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
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(1.6, 1.55, 3.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, 0);
controls.enableDamping = true;
controls.minDistance = 1.6;
controls.maxDistance = 7;
controls.maxPolarAngle = Math.PI * 0.52;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

const jungle = buildJungle(scene);
const character = createHoodedSwordsman(HOODED_SWORDSMAN);
scene.add(character.root);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// High threshold: only the eyes and embers bloom.
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.35, 0.95));
composer.addPass(new OutputPass());

let cannonTarget = 0;
let cannonOpen = 0;
createOverlay(HOODED_SWORDSMAN, {
  onToggleRotate: () => {
    controls.autoRotate = !controls.autoRotate;
  },
  onToggleCannon: () => {
    cannonTarget = cannonTarget > 0 ? 0 : 1;
  },
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const time = clock.getElapsedTime();
  cannonOpen += (cannonTarget - cannonOpen) * 0.12;
  character.arm.setCannonOpen(cannonOpen);
  character.update(time);
  jungle.update(time);
  controls.update();
  composer.render();
});
