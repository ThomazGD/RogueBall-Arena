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

    // Informações do último chute/passe.
    // O goleiro usa esses dados, junto da velocidade atual da bola,
    // para decidir se deve agarrar, espalmar ou apenas tentar bloquear.
    this.lastKickInfo = {
      type: 'none',
      power: 0,
      lift: 0,
      fromTeam: null,
      fromPlayer: null,
      age: 999
    };

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
    this.lastKickInfo = {
      type: 'none',
      power: 0,
      lift: 0,
      fromTeam: null,
      fromPlayer: null,
      age: 999
    };
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
    if (this.lastKickInfo) this.lastKickInfo.age += dt;
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

    const previousPosition = this.position.clone();
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

    // Colisão/controle da bola livre.
    // 1) Se a bola passar pelo corpo de um jogador em carrinho, ela rebate/é bloqueada.
    // 2) Se só existe um jogador na disputa e a bola vem controlável, ele domina automaticamente.
    if (this.looseLockTimer <= 0) {
      let bestPlayer = null;
      let bestDistance = Infinity;
      const speed = this.velocity.length();
      const ballLowEnough = this.position.y <= this.radius + 0.98;

      for (const p of players) {
        if (p.hp <= 0) continue;
        const flatDistance = new THREE.Vector2(this.position.x - p.position.x, this.position.z - p.position.z).length();
        const sweptDistance = this.segmentDistanceToPlayer(previousPosition, this.position, p.position);
        const isSliding = p.slideTimer > 0 || p.action === 'slide';

        if (isSliding && ballLowEnough && sweptDistance < this.radius + p.radius + 0.82) {
          const blockDir = this.position.clone().sub(p.position);
          blockDir.y = 0;
          if (blockDir.lengthSq() < 0.001) blockDir.copy(p.lastMoveDir || new THREE.Vector3(1, 0, 0));
          blockDir.normalize();
          this.owner = null;
          this.lastOwner = p;
          this.lastTouchTeam = p.team;
          this.looseLockTimer = 0.16;
          this.position.copy(p.position).addScaledVector(blockDir, p.radius + this.radius + 0.15);
          this.position.y = Math.max(this.radius + 0.05, this.position.y);
          const absorbed = Math.max(4.8, speed * 0.42);
          this.velocity.copy(blockDir.multiplyScalar(absorbed));
          this.velocity.y = Math.max(0.12, this.velocity.y * 0.22);
          this.lastKickInfo = {
            type: 'slideBlock',
            power: absorbed,
            lift: this.velocity.y,
            fromTeam: p.team,
            fromPlayer: p,
            age: 0
          };
          this.syncMesh(dt);
          return;
        }

        const controllableByTouch = speed <= CONFIG.ball.freePickupSpeed && ballLowEnough;
        const cleanReceive = this.canAutoReceive(p, players, speed, flatDistance, sweptDistance);
        if ((controllableByTouch || cleanReceive) && flatDistance < this.radius + p.radius + CONFIG.ball.controlDistance + (cleanReceive ? 0.62 : 0) && flatDistance < bestDistance) {
          bestDistance = flatDistance;
          bestPlayer = p;
        }
      }

      if (bestPlayer) this.setOwner(bestPlayer, CONFIG.ball.possessionLock);
    }

    this.syncMesh(dt);
  }

  kick(fromPlayer, direction, power, lift = 0.5, type = 'kick') {
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
    this.lastKickInfo = {
      type,
      power,
      lift,
      fromTeam: fromPlayer.team,
      fromPlayer,
      age: 0
    };
    fromPlayer.playKickAnimation?.();
    this.syncMesh(0.016);
  }

  pass(fromPlayer, targetPlayer, power) {
    const targetLead = targetPlayer.velocity ? targetPlayer.velocity.clone().multiplyScalar(0.16) : new THREE.Vector3();
    const target = targetPlayer.position.clone().add(targetLead);
    const dir = target.sub(fromPlayer.position).normalize();
    this.kick(fromPlayer, dir, power, 0.25, 'pass');
    fromPlayer.playPassAnimation?.();
  }


  header(fromPlayer, direction, power = 18, lift = 1.2, type = 'header') {
    const dir = direction.clone ? direction.clone() : new THREE.Vector3(direction.x || 0, 0, direction.z || 0);
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.copy(fromPlayer.lastMoveDir || new THREE.Vector3(0, 0, fromPlayer.team === 'blue' ? -1 : 1));
    dir.normalize();

    this.release(0.24);
    this.owner = null;
    this.lastOwner = fromPlayer;
    this.position.copy(fromPlayer.position).addScaledVector(dir, 0.72);
    this.position.y = Math.max(this.radius + 0.35, 1.82);
    this.velocity.copy(dir.multiplyScalar(Math.min(power, CONFIG.ball.maxSpeed * 0.82)));
    this.velocity.y = lift;
    this.lastTouchTeam = fromPlayer.team;
    this.lastKickInfo = {
      type,
      power,
      lift,
      fromTeam: fromPlayer.team,
      fromPlayer,
      age: 0
    };
    fromPlayer.playHeaderAnimation?.();
    this.syncMesh(0.016);
  }


  passToPoint(fromPlayer, targetPoint, power, lift = 0.22) {
    const target = targetPoint.clone ? targetPoint.clone() : new THREE.Vector3(targetPoint.x || 0, 0, targetPoint.z || 0);
    const dir = target.sub(fromPlayer.position);
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.copy(fromPlayer.lastMoveDir);
    dir.normalize();
    this.kick(fromPlayer, dir, power, lift, 'passToPoint');
    fromPlayer.playPassAnimation?.();
  }


  segmentDistanceToPlayer(a, b, pos) {
    const av = new THREE.Vector2(a.x, a.z);
    const bv = new THREE.Vector2(b.x, b.z);
    const pv = new THREE.Vector2(pos.x, pos.z);
    const ab = bv.clone().sub(av);
    const lenSq = ab.lengthSq();
    if (lenSq <= 0.00001) return pv.distanceTo(bv);
    const t = THREE.MathUtils.clamp(pv.clone().sub(av).dot(ab) / lenSq, 0, 1);
    return pv.distanceTo(av.addScaledVector(ab, t));
  }

  canAutoReceive(player, players, speed, flatDistance, sweptDistance) {
    if (this.position.y > this.radius + 1.08) return false;
    if (speed > 16.5) return false;
    if (flatDistance > 1.38 && sweptDistance > 0.92) return false;

    // Domínio limpo: se a bola vem para um atleta praticamente sozinho,
    // ela não deve passar raspando por ele como se não houvesse controle.
    let nearbyContestants = 0;
    for (const other of players) {
      if (!other || other.hp <= 0 || other === player) continue;
      const d = new THREE.Vector2(this.position.x - other.position.x, this.position.z - other.position.z).length();
      if (d < 2.35) nearbyContestants++;
    }

    const sameTeamPass = this.lastTouchTeam && this.lastTouchTeam === player.team;
    const slowEnoughLoose = speed <= CONFIG.ball.freePickupSpeed * 1.85;
    return nearbyContestants === 0 && (sameTeamPass || slowEnoughLoose);
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
