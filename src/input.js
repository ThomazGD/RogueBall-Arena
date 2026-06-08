import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = new THREE.Vector2(0, 0);

    this.lastWDownAt = 0;
    this.doubleTapWindow = 280;
    this.sprintActive = false;
    this.sprintStartedAt = 0;

    this.shootHeld = false;
    this.passHeld = false;
    this.shootStartAt = 0;
    this.passStartAt = 0;
    this.maxChargeMs = 1200;

    this.actions = {
      shootRelease: null,
      passRelease: null,
      switchPlayer: false,
      callBall: false,
      steal: false,
      slide: false,
      dribble: null,
      cameraMode: null
    };

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const wasAlreadyDown = this.keys.has(key);
      this.keys.add(key);

      if (key === 'w' && !wasAlreadyDown) {
        const now = performance.now();
        if (now - this.lastWDownAt <= this.doubleTapWindow) {
          this.sprintActive = true;
          this.sprintStartedAt = now;
        }
        this.lastWDownAt = now;
      }

      if (key === '1') this.actions.cameraMode = 'follow';
      if (key === '2') this.actions.cameraMode = 'broadcast';
      if (key === '3') this.actions.cameraMode = 'ball';

      if (e.code === 'ShiftLeft') this.actions.switchPlayer = true;
      if (key === 'e') this.actions.callBall = true;

      if (key === 'q' && !wasAlreadyDown) {
        const move = this.getMoveVector();
        let kind = 'neutral';
        if (this.isDown('w')) kind = 'forward';
        else if (this.isDown('s')) kind = 'back';
        else if (this.isDown('a')) kind = 'left';
        else if (this.isDown('d')) kind = 'right';
        this.actions.dribble = { kind, move };
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.actions.steal = true;
      }

      if (key === 'f') this.actions.slide = true;
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.keys.delete(key);
      if (key === 'w') this.sprintActive = false;
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.shootHeld = true;
        this.shootStartAt = performance.now();
      }
      if (e.button === 2) {
        this.passHeld = true;
        this.passStartAt = performance.now();
      }
    });

    window.addEventListener('mouseup', (e) => {
      const now = performance.now();
      if (e.button === 0 && this.shootHeld) {
        this.shootHeld = false;
        const heldMs = Math.max(0, now - this.shootStartAt);
        this.actions.shootRelease = this.buildChargePayload(heldMs);
      }
      if (e.button === 2 && this.passHeld) {
        this.passHeld = false;
        const heldMs = Math.max(0, now - this.passStartAt);
        this.actions.passRelease = this.buildChargePayload(heldMs);
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  buildChargePayload(heldMs) {
    const charge = THREE.MathUtils.clamp(heldMs / this.maxChargeMs, 0, 1);
    const curve = Math.pow(charge, 0.72);
    return { heldMs, charge, curve };
  }

  consumeShootRelease() {
    const value = this.actions.shootRelease;
    this.actions.shootRelease = null;
    return value;
  }

  consumePassRelease() {
    const value = this.actions.passRelease;
    this.actions.passRelease = null;
    return value;
  }

  consumeSwitchPlayer() { return this.consume('switchPlayer'); }
  consumeCallBall() { return this.consume('callBall'); }
  consumeSteal() { return this.consume('steal'); }
  consumeSlide() { return this.consume('slide'); }
  consumeDribble() {
    const value = this.actions.dribble;
    this.actions.dribble = null;
    return value;
  }
  consumeCameraMode() {
    const mode = this.actions.cameraMode;
    this.actions.cameraMode = null;
    return mode;
  }

  consume(action) {
    if (!this.actions[action]) return false;
    this.actions[action] = false;
    return true;
  }

  isDown(key) { return this.keys.has(key.toLowerCase()); }

  getMoveVector() {
    const v = new THREE.Vector3();
    if (this.isDown('w')) v.z -= 1;
    if (this.isDown('s')) v.z += 1;
    if (this.isDown('a')) v.x -= 1;
    if (this.isDown('d')) v.x += 1;
    if (v.lengthSq() > 0) v.normalize();
    return v;
  }

  isSprinting() { return this.sprintActive && this.isDown('w'); }

  getChargeState() {
    const now = performance.now();
    return {
      shoot: this.shootHeld ? this.buildChargePayload(now - this.shootStartAt).charge : 0,
      pass: this.passHeld ? this.buildChargePayload(now - this.passStartAt).charge : 0,
      shootHeld: this.shootHeld,
      passHeld: this.passHeld
    };
  }
}
