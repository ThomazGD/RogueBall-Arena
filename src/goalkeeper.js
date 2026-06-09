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
    this.canLeaveArea = false;
    this.smoothedTarget = this.position.clone();
    this.lastSafeKeeperPosition = this.position.clone();
    this.stuckTimer = 0;
    this.lastMoveCheck = this.position.clone();
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
    this.tryRoamCollect(ball, arena, brain);
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
    this.canLeaveArea = false;
    const ownGoal = arena.getOwnGoalCenter(this.team);
    const home = arena.getKeeperHome(this.team);
    const area = arena.getKeeperArea(this.team);
    const goalMouthLimit = CONFIG.arena.goalWidth / 2 - 3.05;
    const clampGoalX = (x) => THREE.MathUtils.clamp(x, -goalMouthLimit, goalMouthLimit);
    const ballPos = ball.position.clone();

    // Goleiro pode sair da pequena área para uma bola recuada/solta na defesa,
    // mas a função dele continua sendo de goleiro: ele coleta e distribui, não sai atacando.
    const loose = !ball.owner;
    const slowLoose = loose && ball.velocity.length() < 7.2;
    const ownTouch = ball.lastTouchTeam === this.team;
    const defensiveThird = this.team === 'blue' ? ballPos.z > arena.depth * 0.20 : ballPos.z < -arena.depth * 0.20;
    const movingAwayFromGoal = this.team === 'blue' ? ball.velocity.z <= 0.8 : ball.velocity.z >= -0.8;
    const opponentNear = otherTeam?.some?.(p => p.hp > 0 && p.position.distanceTo(ballPos) < 8.5);

    // Saída do goleiro só para bola recuada/solta segura. Ele não sai para virar atacante
    // nem para defender chute antes da bola chegar na zona real de defesa.
    const safeToRoam = slowLoose && defensiveThird && ownTouch && movingAwayFromGoal && !opponentNear;
    if (safeToRoam && !this.isShotTowardGoal(ball, arena)) {
      this.canLeaveArea = true;
      return ballPos;
    }

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
      if (this.canLeaveArea) this.clampKeeperRoam(arena);
      else arena.clampKeeperPosition(this.team, this.position, this.radius);
      if (!this.canLeaveArea) this.lastSafeKeeperPosition.copy(this.position);
      if (this.actionTimer <= 0) this.action = 'run';
    } else if (this.actionTimer <= 0) {
      this.action = 'idle';
    }

    // Anti-stuck simples: se o goleiro ficou travado fora da posição com alvo distante,
    // reposiciona ele suavemente para dentro da área do gol.
    const moved = this.position.distanceTo(this.lastMoveCheck);
    if (!this.canLeaveArea && desired.length() > 1.4 && moved < 0.015 && this.actionTimer <= 0) {
      this.stuckTimer += 0.016;
      if (this.stuckTimer > 0.75) {
        const home = arena.getKeeperHome(this.team);
        this.position.lerp(home, 0.22);
        arena.clampKeeperPosition(this.team, this.position, this.radius);
        this.stuckTimer = 0;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastMoveCheck.copy(this.position);
  }


  clampKeeperRoam(arena) {
    const margin = this.radius + 1.0;
    const halfW = arena.width / 2 - margin;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -halfW, halfW);
    if (this.team === 'blue') {
      this.position.z = THREE.MathUtils.clamp(this.position.z, arena.depth * 0.12, arena.southGoalZ - margin);
    } else {
      this.position.z = THREE.MathUtils.clamp(this.position.z, arena.northGoalZ + margin, -arena.depth * 0.12);
    }
  }

  tryRoamCollect(ball, arena, brain) {
    if (!this.canLeaveArea || ball.owner || this.catchCooldown > 0) return;
    if (this.isShotTowardGoal(ball, arena)) return;
    const flatBall = new THREE.Vector3(ball.position.x, 0, ball.position.z);
    const dist = this.position.distanceTo(flatBall);
    const speed = ball.velocity.length();
    if (dist <= CONFIG.goalkeeper.catchDistance + 0.42 && speed < 9.5 && ball.position.y <= ball.radius + 0.85) {
      ball.setOwner(this, 0.36);
      this.holdTimer = Math.min(this.holdTimer || 0, 0.12);
      this.catchCooldown = 0.28;
      this.playPassAnimation?.();
    }
  }

  trySave(ball, arena, brain) {
    if (this.catchCooldown > 0) return;
    if (ball.owner && ball.owner.team === this.team) return;

    const flatBall = new THREE.Vector3(ball.position.x, 0, ball.position.z);
    const dist = this.position.distanceTo(flatBall);
    const speed = ball.velocity.length();
    const ballHeight = ball.position.y || ball.radius;
    const shotTowardGoal = this.isShotTowardGoal(ball, arena);
    const keeperInsideArea = arena.isInKeeperArea(this.team, this.position, 0.50);
    if (!keeperInsideArea) return;

    const goalLineZ = arena.getOwnGoalCenter(this.team).z;
    const ballDistanceToGoalLine = Math.abs(goalLineZ - ball.position.z);
    const ballInsideSaveArea = arena.isInKeeperArea(this.team, ball.position, 2.75);
    const ballAtGoalMouth = Math.abs(ball.position.x) <= CONFIG.arena.goalWidth / 2 + 1.3 && ballDistanceToGoalLine <= 5.4;
    const timeToGoal = this.getTimeToGoalLine(ball, arena);
    const predictedAtGoal = this.predictBallAtGoalLine(ball, arena);

    // IMPORTANTE: o goleiro pode prever para se POSICIONAR, mas só pode DEFENDER
    // quando a bola chegou fisicamente no alcance dele. Nada de espalmar/agarrar
    // no instante em que a bola sai do pé do atacante.
    if (this.tryHighBallSave(ball, arena, brain, {
      shotTowardGoal,
      keeperInsideArea,
      predictedAtGoal
    })) return;

    // Bola fraca/solta dentro da área: o goleiro encaixa só por contato real.
    const catchRange = CONFIG.goalkeeper.catchDistance + brain.handling * 0.42 + 0.24 - Math.max(0, ballHeight - 1.7) * 0.05;
    const catchableLoose = ballInsideSaveArea && dist <= catchRange && speed <= CONFIG.goalkeeper.catchBallSpeed * (0.72 + brain.handling * 0.34);
    if (!shotTowardGoal && catchableLoose) {
      this.catchBall(ball);
      return;
    }

    if (!shotTowardGoal) return;

    // O goleiro não pula do nada por previsão. A defesa só pode começar quando a bola
    // chegou fisicamente perto do corpo/alcance dele ou está passando pela boca do gol.
    if (!ballInsideSaveArea && !ballAtGoalMouth) return;

    const highShotBonus = ballHeight > 1.05 ? 0.65 + Math.min(0.75, ballHeight * 0.16) : 0;
    const reflexBonus = brain.reflex * 1.05 + brain.positioning * 0.54 + brain.bravery * 0.28;
    const tacticalDiveRange = CONFIG.goalkeeper.diveDistance + reflexBonus + highShotBonus;
    // Alcance FÍSICO usado para defender. O range tático pode ajudar o goleiro a se posicionar,
    // mas a defesa em si só acontece quando a bola chegou no corpo/ponte dele.
    const diveRange = Math.min(tacticalDiveRange, 3.15 + highShotBonus * 0.22);

    const target = flatBall.clone();
    target.y = 0;
    const targetDistance = dist;
    const zGapToKeeper = Math.abs(ball.position.z - this.position.z);
    const lateralGapToKeeper = Math.abs(ball.position.x - this.position.x);

    // Contato real. Mesmo com ponte, a bola precisa estar perto do goleiro em Z.
    // Isso remove definitivamente a defesa antecipada baseada só na previsão do gol.
    const directContact = dist <= catchRange + 0.46 && zGapToKeeper <= 1.18;
    const diveContact = dist <= diveRange + 0.18 && zGapToKeeper <= 1.68;

    // Se a bola vem exatamente no corpo do goleiro, não pode passar como fantasma.
    const bodyBlock = dist <= this.radius + ball.radius + 0.72 && zGapToKeeper <= 1.12 && ballHeight <= CONFIG.arena.goalHeight + 0.45;
    if (!directContact && !diveContact && !bodyBlock) return;

    const outcome = this.evaluateSaveOutcome(ball, arena, brain, Math.min(dist, targetDistance));
    this.catchCooldown = outcome.cooldown;

    const saveTarget = flatBall;
    const dir = saveTarget.clone().sub(this.position);
    dir.y = 0;
    const side = Math.sign(dir.x || this.lastMoveDir.x || 1);
    if (dir.lengthSq() > 0) this.lastMoveDir.copy(dir.normalize());

    if (bodyBlock || directContact || outcome.animation === 'catch') {
      this.playKeeperCatchAnimation();
    } else {
      this.performDiveLunge(ball, arena, outcome, saveTarget, brain);
      this.playKeeperDiveAnimation(side, outcome.high || 0, outcome.forward || 0, outcome.cooldown || 0.72);
    }

    if (outcome.result === 'catch' && (directContact || bodyBlock) && speed <= CONFIG.goalkeeper.catchBallSpeed * (0.95 + brain.handling * 0.25)) {
      this.catchBall(ball);
      return;
    }

    // Goleiro forte: quando não dá para encaixar, ele bloqueia/espalma. Só bola muito bem colocada passa.
    this.parryBall(ball, arena, {
      ...outcome,
      result: 'parry',
      power: Math.max(outcome.power || 0, THREE.MathUtils.clamp(9.5 + speed * 0.36, 10, 22)),
      side: outcome.side || this.chooseParrySide(ball, arena, predictedAtGoal?.x ?? ball.position.x, Math.min(1, Math.abs((predictedAtGoal?.x ?? ball.position.x)) / Math.max(1, CONFIG.arena.goalWidth / 2))),
      danger: Math.max(outcome.danger || 0.35, 0.45)
    });
  }


  performDiveLunge(ball, arena, outcome, target, brain) {
    const targetFlat = target.clone();
    targetFlat.y = 0;
    const dir = targetFlat.sub(this.position);
    dir.y = 0;
    const distance = dir.length();
    if (distance <= 0.01) return;
    dir.normalize();

    // Pequena impulsão física na ponte: não é teleporte, mas ajuda o goleiro a alcançar
    // chutes de canto/alto como uma defesa real.
    const maxLunge = 0.42 + brain.reflex * 0.46 + (outcome.high || 0) * 0.20;
    const lunge = Math.min(distance * 0.38, maxLunge);
    this.position.addScaledVector(dir, lunge);
    // Mesmo na ponte, ele continua dentro da área e dentro da boca das traves.
    arena.clampKeeperPosition(this.team, this.position, this.radius);
    this.lastSafeKeeperPosition.copy(this.position);
  }

  catchBall(ball) {
    ball.setOwner(this, CONFIG.goalkeeper.holdTime);
    this.holdTimer = CONFIG.goalkeeper.holdTime;
    this.catchCooldown = Math.max(this.catchCooldown, 0.50);
    this.playKeeperCatchAnimation();
  }

  evaluateSaveOutcome(ball, arena, brain, dist) {
    const speed = ball.velocity.length();
    const ownGoal = arena.getOwnGoalCenter(this.team);
    const goalHalf = CONFIG.arena.goalWidth / 2;
    const predicted = this.predictBallAtGoalLine(ball, arena);
    const predictedX = predicted ? predicted.x : ball.position.x;
    const cornerFactor = THREE.MathUtils.clamp(Math.abs(predictedX) / Math.max(1, goalHalf), 0, 1);
    const lateralReach = Math.abs(ball.position.x - this.position.x);
    const recentKick = ball.lastKickInfo && ball.lastKickInfo.age < 2.8 ? ball.lastKickInfo : null;
    const kickPower = recentKick ? recentKick.power : speed;
    const height = ball.position.y;

    // Quanto maior o danger, mais provável é espalmar ou falhar em vez de agarrar.
    const speedDanger = THREE.MathUtils.clamp((speed - 8) / 24, 0, 1);
    const powerDanger = THREE.MathUtils.clamp((kickPower - 18) / 24, 0, 1);
    const cornerDanger = THREE.MathUtils.clamp((cornerFactor - 0.45) / 0.55, 0, 1);
    const heightDanger = THREE.MathUtils.clamp((height - 0.85) / 1.55, 0, 1);
    const reachDanger = THREE.MathUtils.clamp((lateralReach - 0.85) / 2.2, 0, 1);
    const isOneVsOne = this.hasAttackerCloseToBall(ball, arena);
    const oneVsOnePenalty = isOneVsOne ? 0.02 : 0;

    const danger = THREE.MathUtils.clamp(
      speedDanger * 0.36 +
      powerDanger * 0.28 +
      cornerDanger * 0.24 +
      heightDanger * 0.10 +
      reachDanger * 0.16 +
      oneVsOnePenalty,
      0,
      1.15
    );

    const quality = THREE.MathUtils.clamp(
      brain.reflex * 0.38 +
      brain.positioning * 0.27 +
      brain.handling * 0.25 +
      brain.bravery * 0.10 -
      dist * 0.026,
      0.05,
      1.35
    );

    // Encaixar deve acontecer mais em bola fraca/central/baixa.
    // Chute forte, alto ou no canto tende a virar espalmo ou rebote.
    let catchChance = THREE.MathUtils.clamp(
      0.54 + brain.handling * 0.22 - danger * 0.62 - cornerDanger * 0.18 - speedDanger * 0.20,
      0.03,
      0.78
    );

    let parryChance = THREE.MathUtils.clamp(
      0.42 + quality * 0.28 + danger * 0.33 - catchChance * 0.16,
      0.18,
      0.93
    );

    // Perto do gol ficou fácil demais: se o chute de 1x1 vem central/baixo,
    // o goleiro tem mais chance de bloquear ou espalmar. Chute alto/no canto ainda passa.
    if (isOneVsOne && cornerFactor < 0.48 && height < 1.9 && lateralReach < 1.55) {
      catchChance = Math.max(catchChance, 0.30 + brain.handling * 0.18);
      parryChance = Math.max(parryChance, 0.64 + brain.reflex * 0.18);
    }

    // Nerf do goleiro: chute carregado ou no canto nunca vira defesa automática.
    const hardShot = speed > 22 || kickPower > 25 || cornerFactor > 0.72 || height > 2.15;
    if (hardShot) {
      catchChance *= height > 2.15 ? 0.22 : 0.38;
      parryChance *= height > 2.15 ? 0.86 : 0.94;
    }

    // Bola bem próxima e lenta: deixa o goleiro encaixar mais.
    if (speed < 10 && lateralReach < 1.0 && height < 1.2) {
      catchChance = Math.max(catchChance, 0.64 + brain.handling * 0.10);
    }

    // Se o goleiro está mal posicionado ou muito esticado, reduz bastante a chance.
    if (reachDanger > 0.74) {
      catchChance *= 0.28;
      parryChance *= 0.78;
    }

    const roll = Math.random();
    const highAnim = THREE.MathUtils.clamp((height - 0.65) / 2.1, 0, 1);
    const forwardAnim = isOneVsOne ? 0.45 : 0.18;

    if (roll < catchChance) {
      return { result: 'catch', animation: 'catch', cooldown: 0.58, high: highAnim, forward: forwardAnim };
    }

    if (roll < catchChance + parryChance) {
      const parrySide = this.chooseParrySide(ball, arena, predictedX, cornerFactor);
      return {
        result: 'parry',
        animation: 'dive',
        cooldown: 0.72,
        power: THREE.MathUtils.clamp(7.5 + speed * 0.30 + danger * 7.0, 8, 18),
        side: parrySide,
        cornerFactor,
        danger,
        high: highAnim,
        forward: forwardAnim
      };
    }

    return { result: 'miss', animation: 'dive', cooldown: 0.82, high: highAnim, forward: forwardAnim };
  }

  predictBallAtGoalLine(ball, arena) {
    const t = this.getTimeToGoalLine(ball, arena);
    if (t === null || t > 2.2) return null;

    // A bola tem gravidade no update(), então a previsão de altura precisa considerar queda.
    // Sem isso, o goleiro pode interpretar errado chutes altos e cabeceios.
    const gravity = 18;
    const predictedY = ball.position.y + ball.velocity.y * t - 0.5 * gravity * t * t;

    return new THREE.Vector3(
      ball.position.x + ball.velocity.x * t,
      Math.max(ball.radius, predictedY),
      arena.getOwnGoalCenter(this.team).z
    );
  }


  tryHighBallSave(ball, arena, brain, state = {}) {
    const { shotTowardGoal, keeperInsideArea, predictedAtGoal } = state;
    if (!keeperInsideArea || !shotTowardGoal) return false;

    const speed = ball.velocity.length();
    const ballHeight = ball.position.y || ball.radius;

    // Só é defesa alta se a bola já está em altura de gol/cabeceio.
    // Bola baixa continua caindo na lógica normal de encaixe/espalmo.
    if (ballHeight < 1.02 || ballHeight > CONFIG.arena.goalHeight + 0.72) return false;

    const goalHalf = CONFIG.arena.goalWidth / 2;
    const ballInsideGoalFrameNow = Math.abs(ball.position.x) <= goalHalf + 1.15;
    const predictedInsideGoal = predictedAtGoal
      ? Math.abs(predictedAtGoal.x) <= goalHalf + 1.0 && predictedAtGoal.y <= CONFIG.arena.goalHeight + 0.65
      : true;

    if (!ballInsideGoalFrameNow || !predictedInsideGoal) return false;

    const flatBall = new THREE.Vector3(ball.position.x, 0, ball.position.z);
    const flatDistance = this.position.distanceTo(flatBall);
    const zGapToKeeper = Math.abs(ball.position.z - this.position.z);
    const lateralGapToKeeper = Math.abs(ball.position.x - this.position.x);
    const verticalGap = Math.max(0, ballHeight - 1.28);

    // REGRA PRINCIPAL: defesa alta só quando a bola CHEGOU no goleiro.
    // A ponte alcança lateralmente, mas não pode alcançar uma bola que ainda está longe no eixo Z.
    const catchReachX = CONFIG.goalkeeper.catchDistance + brain.handling * 0.42 + 0.42;
    const diveReachX = Math.min(
      CONFIG.goalkeeper.diveDistance + brain.reflex * 0.92 + brain.positioning * 0.45 + Math.min(0.65, verticalGap * 0.22),
      3.65 + Math.min(0.35, verticalGap * 0.10)
    );
    const closeInDepthForCatch = zGapToKeeper <= 1.12;
    const closeInDepthForDive = zGapToKeeper <= 1.62;

    const directHighCatch = closeInDepthForCatch && lateralGapToKeeper <= catchReachX && speed < 18.5;
    const canHighDive = closeInDepthForDive && flatDistance <= diveReachX + 0.18 && lateralGapToKeeper <= diveReachX;

    if (!directHighCatch && !canHighDive) return false;

    const saveTarget = flatBall;
    const dir = saveTarget.clone().sub(this.position);
    dir.y = 0;
    const side = Math.sign(dir.x || this.lastMoveDir.x || 1);
    if (dir.lengthSq() > 0.001) this.lastMoveDir.copy(dir.normalize());

    this.catchCooldown = Math.max(this.catchCooldown, directHighCatch ? 0.58 : 0.78);

    if (directHighCatch) {
      this.playKeeperCatchAnimation();
      this.catchBall(ball);
      return true;
    }

    const outcome = {
      result: 'parry',
      animation: 'dive',
      cooldown: 0.82,
      high: THREE.MathUtils.clamp((ballHeight - 1.0) / 2.3, 0.35, 1),
      forward: 0.18,
      power: THREE.MathUtils.clamp(10.5 + speed * 0.30 + verticalGap * 1.25, 11, 22),
      side: this.chooseParrySide(ball, arena, ball.position.x, Math.min(1, Math.abs(ball.position.x) / Math.max(1, goalHalf))),
      danger: THREE.MathUtils.clamp((speed - 10) / 24 + verticalGap * 0.15, 0.42, 1)
    };

    this.performDiveLunge(ball, arena, outcome, saveTarget, brain);
    this.playKeeperDiveAnimation(side, outcome.high, outcome.forward, outcome.cooldown);
    this.parryBall(ball, arena, outcome);
    return true;
  }

  getTimeToGoalLine(ball, arena) {
    if (Math.abs(ball.velocity.z) < 0.05) return null;
    const goalZ = arena.getOwnGoalCenter(this.team).z;
    const t = (goalZ - ball.position.z) / ball.velocity.z;
    if (t < 0) return null;
    return t;
  }

  hasAttackerCloseToBall(ball, arena) {
    const kick = ball.lastKickInfo;
    if (!kick?.fromPlayer) return false;
    if (kick.fromPlayer.team === this.team) return false;
    const d = kick.fromPlayer.position.distanceTo(arena.getOwnGoalCenter(this.team));
    return d < 18;
  }

  chooseParrySide(ball, arena, predictedX, cornerFactor) {
    const ownGoal = arena.getOwnGoalCenter(this.team);
    const goalToBall = ball.position.clone().sub(ownGoal);
    goalToBall.y = 0;

    // Se o chute vem para o canto, espalma para fora do centro.
    const xSide = predictedX >= 0 ? 1 : -1;
    const zAway = this.team === 'blue' ? -1 : 1;

    if (cornerFactor > 0.55) {
      return new THREE.Vector3(xSide * 0.95, 0, zAway * 0.34).normalize();
    }

    // Chute central: espalma para uma diagonal lateral, evitando rebote no meio.
    const randomSide = Math.random() < 0.5 ? -1 : 1;
    return new THREE.Vector3(randomSide * 0.82, 0, zAway * 0.58).normalize();
  }

  parryBall(ball, arena, outcome) {
    const dir = outcome.side.clone();
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.set(Math.random() < 0.5 ? -1 : 1, 0, this.team === 'blue' ? -1 : 1);
    dir.normalize();

    ball.release(0.22);
    ball.owner = null;
    ball.lastOwner = this;
    ball.lastTouchTeam = this.team;
    ball.position.y = Math.max(ball.position.y, ball.radius + 0.10);
    ball.velocity.copy(dir.multiplyScalar(outcome.power));

    // Espalmo alto/forte gera bola viva e rebote. Chute muito forte ganha um pouco de altura.
    ball.velocity.y = 0.22 + outcome.danger * 0.75 + Math.random() * 0.18;
    ball.lastKickInfo = {
      type: 'keeperParry',
      power: outcome.power,
      lift: ball.velocity.y,
      fromTeam: this.team,
      fromPlayer: this,
      age: 0,
      rebound: true
    };
    ball.syncMesh(0.016);
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
