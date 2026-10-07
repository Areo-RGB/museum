import * as THREE from 'three';

const SPEED = 3.2;
const HEIGHT = 1.65;
const SENS = 0.002;
const PITCH_LIMIT = Math.PI * 0.47;

export class PlayerController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.dir = new THREE.Vector3();
    this.keys = new Set();
    this.enabled = true;
    this._move = (e) => this.onMouseMove(e);
    this._down = (e) => this.keys.add(e.code);
    this._up = (e) => this.keys.delete(e.code);
    this._lock = () => this.onLockChange();
    document.addEventListener('pointerlockchange', this._lock);
  }

  lock() { if (this.enabled) this.canvas.requestPointerLock(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  get locked() { return document.pointerLockElement === this.canvas; }

  onLockChange() {
    if (this.locked) {
      document.addEventListener('mousemove', this._move);
      document.addEventListener('keydown', this._down);
      document.addEventListener('keyup', this._up);
    } else {
      document.removeEventListener('mousemove', this._move);
      document.removeEventListener('keydown', this._down);
      document.removeEventListener('keyup', this._up);
      this.keys.clear();
    }
  }

  onMouseMove(e) {
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= e.movementX * SENS;
    this.euler.x -= e.movementY * SENS;
    this.euler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  update(dt, collisionCheck) {
    if (!this.locked || !this.enabled) return;
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    this.dir.set(x, 0, z);
    if (!this.dir.lengthSq()) return;
    this.dir.normalize();
    const yaw = this.euler.y;
    const world = new THREE.Vector3(
      this.dir.x * Math.cos(yaw) + this.dir.z * Math.sin(yaw),
      0,
      -this.dir.x * Math.sin(yaw) + this.dir.z * Math.cos(yaw)
    ).multiplyScalar(SPEED * dt);
    const next = this.camera.position.clone().add(world);
    next.y = HEIGHT;
    if (!collisionCheck || !collisionCheck(next)) this.camera.position.copy(next);
  }
}