import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { CONFIG } from './config.js';

export class Ball {
  constructor(scene) {
    this.scene = scene;
    this.radius = CONFIG.ball.radius;
    this.position = new THREE.Vector3(0, this.radius, 0);
    this.velocity = new THREE.Vector3();
    this.owner = null;
    this.lastTouchTeam = null;

    // Evita o bug da bola tremendo quando dois jogadores disputam a posse.
    // Quando alguém pega/rouba a bola, a posse fica travada por poucos frames.
    this.ownerLockTimer = 0;
    this.looseLockTimer = 0;
    this.lastOwner = null;

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(this.radius, 32, 22), mat);
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);
  }

  reset() {
    this.owner = null;
    this.lastOwner = null;
    this.lastTouchTeam = null;
    this.ownerLockTimer = 0;
    this.looseLockTimer = 0;
    this.position.set(0, this.radius, 0);
    this.velocity.set(0, 0, 0);
    this.syncMesh(0.016);
  }

  setOwner(player, lockTime = CONFIG.ball.possessionLock) {
    if (!player || player.hp <= 0) return false;
    this.owner = player;
    this.lastOwner = player;
    this.lastTouchTeam = player.team;
    this.ownerLockTimer = Math.max(this.ownerLockTimer, lockTime);
    this.looseLockTimer = 0;
    this.velocity.set(0, 0, 0);
    return true;
  }

  release(lockTime = CONFIG.ball.looseAfterKickLock) {
    this.lastOwner = this.owner;
    this.owner = null;
    this.ownerLockTimer = 0;
    this.looseLockTimer = Math.max(this.looseLockTimer, lockTime);
  }

  canBeStolenBy(player) {
    return this.owner && player && this.owner.team !== player.team && this.ownerLockTimer <= 0;
  }

  isFreePickupSpeed() {
    return this.velocity.length() <= CONFIG.ball.freePickupSpeed;
  }

  pokeLoose(fromPlayer, direction, power = 6.5) {
    const dir = direction.clone();
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.copy(fromPlayer.lastMoveDir);
    dir.normalize();
    this.release(0.12);
    this.position.copy(fromPlayer.position).addScaledVector(dir, 0.9);
    this.position.y = this.radius + 0.04;
    this.velocity.copy(dir.multiplyScalar(power));
    this.velocity.y = 0.15;
    this.lastTouchTeam = fromPlayer.team;
  }

  update(dt, arena, players = []) {
    this.ownerLockTimer = Math.max(0, this.ownerLockTimer - dt);
    this.looseLockTimer = Math.max(0, this.looseLockTimer - dt);

    if (this.owner) {
      const dir = this.owner.lastMoveDir.clone();
      dir.y = 0;
      if (dir.lengthSq() === 0) dir.set(0, 0, this.owner.team === 'blue' ? -1 : 1);
      dir.normalize();

      // Suavização pequena para a bola não piscar/tremular quando o dono é empurrado na disputa.
      const desired = this.owner.position.clone().addScaledVector(dir, CONFIG.ball.ownerOffset);
      desired.y = this.radius;
      this.position.lerp(desired, Math.min(1, dt * 28));
      this.velocity.set(0, 0, 0);
      this.lastTouchTeam = this.owner.team;
      this.syncMesh(dt);
      return;
    }

    this.velocity.y -= 18 * dt;
    this.position.addScaledVector(this.velocity, dt);

    if (this.position.y < this.radius) {
      this.position.y = this.radius;
      this.velocity.y *= -0.32;
      this.velocity.x *= CONFIG.ball.friction;
      this.velocity.z *= CONFIG.ball.friction;
    }

    const halfW = arena.width / 2 - this.radius;
    const halfD = arena.depth / 2 - this.radius;
    if (this.position.x < -halfW || this.position.x > halfW) {
      this.position.x = THREE.MathUtils.clamp(this.position.x, -halfW, halfW);
      this.velocity.x *= -0.66;
    }
    if (this.position.z < -halfD || this.position.z > halfD) {
      this.position.z = THREE.MathUtils.clamp(this.position.z, -halfD, halfD);
      this.velocity.z *= -0.66;
    }

    if (this.velocity.length() < CONFIG.ball.stopSpeed) this.velocity.set(0, 0, 0);

    // Posse de bola livre: escolhe o jogador mais próximo em vez do primeiro do array.
    // Isso remove a alternância rápida de dono quando dois atletas encostam juntos.
    if (this.looseLockTimer <= 0) {
      let bestPlayer = null;
      let bestDistance = Infinity;
      const speed = this.velocity.length();

      for (const p of players) {
        if (p.hp <= 0) continue;
        const flatDistance = new THREE.Vector2(this.position.x - p.position.x, this.position.z - p.position.z).length();

        // Bola livre: qualquer time pode pegar só chegando perto, mas somente quando ela está controlável.
        // Bola em chute forte não gruda em ninguém; isso evita prender/tremer em disputas.
        const ballIsControllable = speed <= CONFIG.ball.freePickupSpeed;
        if (flatDistance < this.radius + p.radius + CONFIG.ball.controlDistance && ballIsControllable && flatDistance < bestDistance) {
          bestDistance = flatDistance;
          bestPlayer = p;
        }
      }

      if (bestPlayer) this.setOwner(bestPlayer, CONFIG.ball.possessionLock);
    }

    this.syncMesh(dt);
  }

  kick(fromPlayer, direction, power, lift = 0.5) {
    const dir = direction.clone();
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.copy(fromPlayer.lastMoveDir);
    dir.normalize();

    this.release(CONFIG.ball.looseAfterKickLock);
    this.position.copy(fromPlayer.position).addScaledVector(dir, 1.05);
    this.position.y = this.radius + 0.06;
    this.velocity.copy(dir.multiplyScalar(Math.min(power, CONFIG.ball.maxSpeed)));
    this.velocity.y = lift;
    this.lastTouchTeam = fromPlayer.team;
    fromPlayer.playKickAnimation?.();
    this.syncMesh(0.016);
  }

  pass(fromPlayer, targetPlayer, power) {
    const targetLead = targetPlayer.velocity ? targetPlayer.velocity.clone().multiplyScalar(0.16) : new THREE.Vector3();
    const target = targetPlayer.position.clone().add(targetLead);
    const dir = target.sub(fromPlayer.position).normalize();
    this.kick(fromPlayer, dir, power, 0.25);
    fromPlayer.playPassAnimation?.();
  }



  passToPoint(fromPlayer, targetPoint, power, lift = 0.22) {
    const target = targetPoint.clone ? targetPoint.clone() : new THREE.Vector3(targetPoint.x || 0, 0, targetPoint.z || 0);
    const dir = target.sub(fromPlayer.position);
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.copy(fromPlayer.lastMoveDir);
    dir.normalize();
    this.kick(fromPlayer, dir, power, lift);
    fromPlayer.playPassAnimation?.();
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.position);
    const flatSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
    if (flatSpeed > 0.05) {
      this.mesh.rotation.x += this.velocity.z * dt * 2.1;
      this.mesh.rotation.z -= this.velocity.x * dt * 2.1;
    }
  }
}
