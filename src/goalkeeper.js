import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { Player } from './player.js';
import { CONFIG } from './config.js';

export class Goalkeeper extends Player {
  constructor(scene, options = {}) {
    super(scene, {
      ...options,
      role: 'goalkeeper',
      isGoalkeeper: true,
      radius: CONFIG.goalkeeper.radius,
      speed: options.speed || CONFIG.goalkeeper.speed,
      kickPower: CONFIG.goalkeeper.clearPower,
      passPower: CONFIG.goalkeeper.passPower
    });

    this.aiSpeed = options.speed || CONFIG.goalkeeper.speed;
    this.brain = { ...CONFIG.goalkeeper.baseBrain, ...(options.brain || {}) };
    this.decisionTimer = 0;
    this.catchCooldown = 0;
    this.holdTimer = 0;
    this.smoothedTarget = this.position.clone();
  }

  setBrain(brain = {}) {
    this.brain = { ...this.brain, ...brain };
  }

  updateGoalkeeper(dt, context) {
    const { arena, ball, allies, enemies, allPlayers, goalieBrains = {}, difficulty = 1 } = context;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.decisionTimer = Math.max(0, this.decisionTimer - dt);
    this.catchCooldown = Math.max(0, this.catchCooldown - dt);
    this.holdTimer = Math.max(0, this.holdTimer - dt);
    this.actionTimer = Math.max(0, this.actionTimer - dt);

    const teamBrain = goalieBrains[this.team] || CONFIG.goalkeeper.baseBrain;
    const brain = this.mixBrain(teamBrain);
    const myTeam = this.team === 'blue' ? allies : enemies;
    const otherTeam = this.team === 'blue' ? enemies : allies;

    if (ball.owner === this) {
      this.velocity.set(0, 0, 0);
      if (this.actionTimer <= 0) this.action = 'idle';
      this.distributeBall(ball, arena, myTeam, otherTeam, brain);
      this.updateGoalkeeperFacing(ball, arena);
      this.syncMesh(dt);
      return;
    }

    const target = this.getTarget(arena, ball, otherTeam, brain);
    this.smoothedTarget.lerp(target, 1 - Math.pow(0.018, dt));
    this.moveTo(dt, arena, this.smoothedTarget, allPlayers, brain, difficulty);
    this.trySave(ball, arena, brain);
    this.updateGoalkeeperFacing(ball, arena);
    this.syncMesh(dt);
  }


  updateGoalkeeperFacing(ball, arena) {
    // O goleiro não deve virar de lado só porque se deslocou lateralmente.
    // Ele deve ficar olhando para a bola/campo.
    const target = ball?.position ? ball.position : arena.getKeeperHome(this.team);
    const dir = target.clone().sub(this.position);
    dir.y = 0;

    if (dir.lengthSq() < 0.001) {
      dir.set(0, 0, this.team === 'blue' ? -1 : 1);
    }

    this.facingDir = dir.normalize();
  }

  mixBrain(teamBrain) {
    const out = {};
    for (const k of Object.keys(CONFIG.goalkeeper.baseBrain)) {
      out[k] = THREE.MathUtils.clamp((this.brain[k] || 0.5) * 0.45 + (teamBrain[k] || 0.5) * 0.55, 0.25, 1.9);
    }
    return out;
  }

  getTarget(arena, ball, otherTeam, brain) {
    const ownGoal = arena.getOwnGoalCenter(this.team);
    const home = arena.getKeeperHome(this.team);
    const area = arena.getKeeperArea(this.team);
    const goalMouthLimit = CONFIG.arena.goalWidth / 2 - 3.05;
    const clampGoalX = (x) => THREE.MathUtils.clamp(x, -goalMouthLimit, goalMouthLimit);
    const ballPos = ball.position.clone();

    const ballInDanger = arena.isInKeeperArea(this.team, ballPos, 4.0);
    const shotTowardGoal = this.isShotTowardGoal(ball, arena);

    if (!ball.owner && (ballInDanger || shotTowardGoal)) {
      const intercept = this.predictInterception(ball, arena, brain);
      return intercept || ballPos;
    }

    if (ball.owner && ball.owner.team !== this.team) {
      const owner = ball.owner;
      const ownerDanger = arena.isInKeeperArea(this.team, owner.position, 7.2);
      if (ownerDanger) {
        const line = owner.position.clone().lerp(ownGoal, 0.42 + brain.positioning * 0.12);
        line.x = clampGoalX(line.x);
        line.z = THREE.MathUtils.clamp(line.z, area.minZ + this.radius, area.maxZ - this.radius);
        return line;
      }
    }

    const shadowX = clampGoalX(ballPos.x * (0.34 + brain.positioning * 0.26));
    return new THREE.Vector3(shadowX, 0, home.z);
  }

  isShotTowardGoal(ball, arena) {
    if (ball.owner) return false;
    if (ball.velocity.length() < 5) return false;
    if (this.team === 'blue') return ball.velocity.z > 1.0 && ball.position.z > 0;
    return ball.velocity.z < -1.0 && ball.position.z < 0;
  }

  predictInterception(ball, arena, brain) {
    if (Math.abs(ball.velocity.z) < 0.05) return null;
    const home = arena.getKeeperHome(this.team);
    const targetZ = home.z;
    const t = (targetZ - ball.position.z) / ball.velocity.z;
    if (t < 0 || t > 1.8 + brain.reflex * 1.0) return null;
    const predictedX = ball.position.x + ball.velocity.x * t;
    const goalMouthLimit = CONFIG.arena.goalWidth / 2 - 1.65;
    return new THREE.Vector3(THREE.MathUtils.clamp(predictedX, -goalMouthLimit, goalMouthLimit), 0, targetZ);
  }

  moveTo(dt, arena, target, allPlayers, brain, difficulty) {
    const desired = target.clone().sub(this.position);
    desired.y = 0;
    this.velocity.set(0, 0, 0);

    if (desired.length() > 0.12) {
      desired.normalize();
      this.lastMoveDir.lerp(desired, Math.min(1, dt * (9 + brain.reflex * 8)));
      if (this.lastMoveDir.lengthSq() > 0) this.lastMoveDir.normalize();
      const boost = 1 + (brain.reflex - 0.5) * 0.34 + (brain.positioning - 0.5) * 0.14 + (this.team === 'red' ? Math.min(0.34, difficulty * 0.09) : 0);
      this.velocity.copy(this.lastMoveDir).multiplyScalar(this.aiSpeed * boost);
      this.position.addScaledVector(this.velocity, dt);
      arena.clampKeeperPosition(this.team, this.position, this.radius);
      if (this.actionTimer <= 0) this.action = 'run';
    } else if (this.actionTimer <= 0) {
      this.action = 'idle';
    }
  }

  trySave(ball, arena, brain) {
    if (this.catchCooldown > 0) return;
    if (ball.owner && ball.owner.team === this.team) return;

    const flatBall = new THREE.Vector3(ball.position.x, 0, ball.position.z);
    const dist = this.position.distanceTo(flatBall);
    const inArea = arena.isInKeeperArea(this.team, ball.position, 0.75);
    const speed = ball.velocity.length();
    const catchRange = CONFIG.goalkeeper.catchDistance + brain.handling * 0.16;
    const diveRange = CONFIG.goalkeeper.diveDistance + brain.reflex * 0.24;

    if (inArea && dist <= catchRange && speed <= CONFIG.goalkeeper.catchBallSpeed * (0.70 + brain.handling * 0.42)) {
      ball.setOwner(this, CONFIG.goalkeeper.holdTime);
      this.holdTimer = CONFIG.goalkeeper.holdTime;
      this.catchCooldown = 0.45;
      this.playKeeperCatchAnimation();
      return;
    }

    const shotTowardGoal = this.isShotTowardGoal(ball, arena);
    if (shotTowardGoal && dist <= diveRange) {
      const chance = THREE.MathUtils.clamp(0.18 + brain.reflex * 0.20 + brain.bravery * 0.08 + brain.handling * 0.08, 0.16, 0.62);
      this.catchCooldown = 0.7;
      const dir = flatBall.clone().sub(this.position);
      dir.y = 0;
      if (dir.lengthSq() > 0) this.lastMoveDir.copy(dir.normalize());
      this.playKeeperDiveAnimation();
      if (Math.random() < chance) {
        if (speed < CONFIG.goalkeeper.catchBallSpeed * (0.72 + brain.handling * 0.32)) {
          ball.setOwner(this, CONFIG.goalkeeper.holdTime);
          this.holdTimer = CONFIG.goalkeeper.holdTime;
        } else {
          const away = ball.position.clone().sub(arena.getOwnGoalCenter(this.team));
          away.y = 0;
          if (away.lengthSq() === 0) away.set(this.team === 'blue' ? 1 : -1, 0, this.team === 'blue' ? -1 : 1);
          ball.pokeLoose(this, away.normalize(), 9 + brain.bravery * 6);
        }
      }
    }
  }

  distributeBall(ball, arena, myTeam, otherTeam, brain) {
    if (this.holdTimer > 0 || this.decisionTimer > 0 || !this.canShoot()) return;
    this.decisionTimer = 0.25;

    const outlet = this.findBestOutlet(myTeam, otherTeam, brain, arena);

    // Prioridade máxima: tocar para quem está mais livre, com melhor linha de passe
    // e melhor progressão. Só dá chutão quando não existe opção segura.
    if (outlet?.player && outlet.score > -2.5) {
      const target = outlet.player;
      const distance = this.position.distanceTo(target.position);
      const passPower = CONFIG.goalkeeper.passPower + distance * 0.36 + brain.distribution * 2.1;
      ball.pass(this, target, passPower);
      this.playPassAnimation();
      this.markShot(0.72);
      return;
    }

    const clearTarget = outlet?.fallback || this.getSafeClearTarget(arena, otherTeam, brain);
    const clearDir = clearTarget.clone().sub(this.position);
    clearDir.y = 0;
    if (clearDir.lengthSq() === 0) clearDir.set((Math.random() - 0.5) * 0.3, 0, this.team === 'blue' ? -1 : 1);
    clearDir.normalize();

    ball.kick(this, clearDir, CONFIG.goalkeeper.clearPower * (0.9 + brain.distribution * 0.22), 0.38);
    this.playKickAnimation();
    this.markShot(1.0);
  }

  findBestOutlet(myTeam, otherTeam, brain, arena) {
    let best = null;
    let bestScore = -Infinity;
    let fallback = null;
    let fallbackScore = -Infinity;

    const attackSign = this.team === 'blue' ? -1 : 1;
    const enemyGoal = arena.getGoalCenter(this.team);

    for (const mate of myTeam) {
      if (mate.hp <= 0 || mate.isGoalkeeper) continue;

      const pressure = this.getNearestDistance(otherTeam, mate.position);
      const forward = this.team === 'blue' ? this.position.z - mate.position.z : mate.position.z - this.position.z;
      const dist = this.position.distanceTo(mate.position);
      const wide = Math.abs(mate.position.x) * 0.08;
      const centralRisk = Math.abs(mate.position.x) < 3 && pressure < 4 ? -4.5 : 0;
      const laneClear = this.hasClearLane(mate.position, otherTeam, 2.0 - brain.distribution * 0.35);
      const goalProgress = Math.max(0, 42 - mate.position.distanceTo(enemyGoal)) * 0.04;
      const roleBonus = mate.role === 'wing' ? 2.2 : mate.role === 'striker' ? 1.9 : mate.role === 'mid' ? 1.2 : 0.4;
      const nearestEnemy = this.getClosest(otherTeam, mate.position);
      const receivingSpace = nearestEnemy ? Math.min(8, pressure) : 8;

      const score =
        receivingSpace * 0.9 +
        forward * (0.34 + brain.distribution * 0.18) +
        wide +
        goalProgress +
        roleBonus +
        (laneClear ? 7.0 : -8.5) -
        dist * 0.035 +
        centralRisk +
        brain.distribution * 2.6;

      if (score > bestScore) { bestScore = score; best = mate; }

      const fallbackValue = forward * 0.35 + Math.abs(mate.position.x) * 0.12 - dist * 0.015;
      if (fallbackValue > fallbackScore) {
        fallbackScore = fallbackValue;
        fallback = mate.position.clone().add(new THREE.Vector3(Math.sign(mate.position.x || 1) * 5, 0, attackSign * 6));
      }
    }

    return { player: best, score: bestScore, fallback };
  }


  getSafeClearTarget(arena, otherTeam, brain) {
    const sign = this.team === 'blue' ? -1 : 1;
    const halfW = CONFIG.arena.width / 2 - 8;
    const halfD = CONFIG.arena.depth / 2 - 8;
    const options = [
      new THREE.Vector3(-halfW * 0.55, 0, this.position.z + sign * 26),
      new THREE.Vector3(halfW * 0.55, 0, this.position.z + sign * 26),
      new THREE.Vector3(0, 0, this.position.z + sign * 32)
    ];

    let best = options[0];
    let bestScore = -Infinity;
    for (const option of options) {
      option.x = THREE.MathUtils.clamp(option.x, -halfW, halfW);
      option.z = THREE.MathUtils.clamp(option.z, -halfD, halfD);
      const pressure = this.getNearestDistance(otherTeam, option);
      const lane = this.hasClearLane(option, otherTeam, 2.3) ? 4 : -3;
      const score = pressure + lane + Math.abs(option.x) * 0.04 + brain.distribution;
      if (score > bestScore) { bestScore = score; best = option; }
    }
    return best;
  }

  hasClearLane(target, opponents, clearance = 1.8) {
    const a = this.position.clone();
    const b = target.clone();
    const ab = b.clone().sub(a);
    const abLenSq = ab.lengthSq();
    if (abLenSq === 0) return true;

    for (const op of opponents) {
      if (op.hp <= 0) continue;
      const ap = op.position.clone().sub(a);
      const t = THREE.MathUtils.clamp(ap.dot(ab) / abLenSq, 0, 1);
      const closest = a.clone().addScaledVector(ab, t);
      if (closest.distanceTo(op.position) < clearance) return false;
    }
    return true;
  }

  getClosest(list, pos) {
    let best = null;
    let bestDist = Infinity;
    for (const item of list) {
      if (item.hp <= 0) continue;
      const d = item.position.distanceTo(pos);
      if (d < bestDist) { bestDist = d; best = item; }
    }
    return best;
  }

  getNearestDistance(list, pos) {
    let best = Infinity;
    for (const item of list) {
      if (item.hp > 0) best = Math.min(best, item.position.distanceTo(pos));
    }
    return best;
  }
}
