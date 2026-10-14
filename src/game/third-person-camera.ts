import * as THREE from 'three';
import { TUNING } from './tuning';

// Over-the-shoulder camera that orbits the player with the mouse or right stick.
export class ThirdPersonCamera {
  yaw = Math.PI;
  pitch = 0.18;
  private readonly lookAt = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  update(dt: number, target: THREE.Vector3, look: { x: number; y: number }): void {
    const c = TUNING.camera;
    this.yaw -= look.x;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, c.minPitch, c.maxPitch);

    const back = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // Screen-right of the camera (forward x up), so the player sits off the right shoulder.
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this.lookAt.copy(target).add(new THREE.Vector3(0, c.height, 0)).addScaledVector(right, c.shoulder);
    this.desired.copy(this.lookAt).addScaledVector(back, c.distance);
    this.desired.y = Math.max(this.desired.y, 0.4);

    const follow = 1 - Math.exp(-dt * 14);
    this.camera.position.lerp(this.desired, follow);
    this.camera.lookAt(this.lookAt);
  }

  // Flat forward direction the camera is facing; attacks aim along this.
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
}
