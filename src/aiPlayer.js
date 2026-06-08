import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { Player } from './player.js';
import { CONFIG } from './config.js';

export class AIPlayer extends Player {
  constructor(scene, options = {}) {
    super(scene, options);
    this.aiSpeed = options.speed || CONFIG.ai.speed;
    this.damageCooldown = 0;
    this.decisionTimer = 0;
    this.tackleCooldown = Math.random() * 0.35;
    this.brainThinkTimer = 0;
    this.smoothedTarget = this.position.clone();
    this.personality = options.personality || 'balanced';
    this.brain = { ...CONFIG.ai.baseBrain, ...(options.brain || {}) };

    // Memória tática: evita jogador parado e evita todos marcarem o mesmo adversário.
    this.lastTacticalTarget = this.position.clone();
    this.stuckTimer = 0;
    this.coverShadowTimer = Math.random() * 0.4;
    this.markingTarget = null;
    this.supportSeed = Math.random() * Math.PI * 2;
  }

  setBrain(brain = {}) {
    this.brain = { ...this.brain, ...brain };
  }

  updateAI(dt, context) {
    const { arena, ball, controlled, allies, enemies, allPlayers, difficulty = 1, modifiers = {}, teamBrains = {}, tacticalStyle = 'balanced' } = context;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.decisionTimer = Math.max(0, this.decisionTimer - dt);
    this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);
    this.brainThinkTimer = Math.max(0, this.brainThinkTimer - dt);
    this.actionTimer = Math.max(0, this.actionTimer - dt);

    const teamBrain = teamBrains[this.team] || CONFIG.ai.baseBrain;
    const brain = this.mixBrain(teamBrain);
    const myTeam = this.team === 'blue' ? allies : enemies;
    const otherTeam = this.team === 'blue' ? enemies : allies;
    const enemyGoal = arena.getGoalCenter(this.team);

    let tacticalTarget = this.getTacticalTarget(ball, controlled, myTeam, otherTeam, enemyGoal, brain, modifiers, tacticalStyle);

    // Anti-parado: se ficou muito tempo sem sair do lugar, assume uma microfunção
    // de apoio/marcação para voltar a participar da jogada.
    if (this.velocity.length() < 0.08 && this.position.distanceTo(this.lastTacticalTarget) < 0.22) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2.2);
    }
    this.lastTacticalTarget.copy(this.position);
    if (this.stuckTimer > 0.75) {
      tacticalTarget = this.getAntiStuckTarget(ball, myTeam, otherTeam, arena, brain);
    }

    // Suaviza decisão para IA não ficar virando de um lado para o outro quando disputa a bola.
    this.smoothedTarget.lerp(tacticalTarget, 1 - Math.pow(0.018, dt));
    this.moveTowards(dt, arena, this.smoothedTarget, allPlayers, difficulty, brain, modifiers, ball);

    this.tryInteractWithBall(ball, arena, myTeam, otherTeam, enemyGoal, difficulty, brain, modifiers, tacticalStyle);
    this.tryTackle(ball, brain, modifiers);
    this.syncMesh(dt);
  }

  mixBrain(teamBrain) {
    const out = {};
    for (const k of Object.keys(CONFIG.ai.baseBrain)) {
      out[k] = THREE.MathUtils.clamp((this.brain[k] || 0.5) * 0.45 + (teamBrain[k] || 0.5) * 0.55, 0.25, 1.8);
    }
    return out;
  }

  getTacticalTarget(ball, controlled, myTeam, otherTeam, enemyGoal, brain, modifiers, tacticalStyle = 'balanced') {
    const attackingSign = this.team === 'blue' ? -1 : 1;
    const phase = this.getMatchPhase(ball);
    const halfW = CONFIG.arena.width / 2 - 4;
    const halfD = CONFIG.arena.depth / 2 - 6;

    if (ball.owner === this) {
      const distToGoal = this.position.distanceTo(enemyGoal);
      const openShot = this.hasClearLane(enemyGoal, otherTeam, 2.35 - brain.vision * 0.75);
      const directLane = Math.abs(this.position.x) < CONFIG.arena.goalWidth * 0.78;
      const pressure = this.getNearestDistance(otherTeam, this.position);

      // Rival e aliado com bola precisam ter intenção: não ficar só tocando eternamente.
      // Se chegou perto, livre ou com goleiro exposto, decide finalizar ou carregar para ângulo melhor.
      if (distToGoal < CONFIG.ai.shotDistance + brain.shooting * 7.5 && (openShot || directLane || pressure > 5.8 || brain.shooting > 1.0)) {
        return enemyGoal;
      }

      const passTarget = this.findBestPass(myTeam, otherTeam, enemyGoal, brain);
      const stylePassBias = tacticalStyle === 'passing' ? 1.18 : tacticalStyle === 'aggressive' || tacticalStyle === 'direct' ? 0.42 : tacticalStyle === 'defensive' ? 0.95 : 0.76;
      const mustPass = pressure < 3.7 || (tacticalStyle === 'passing' && pressure < 7.5);
      if (passTarget && mustPass && Math.random() < (0.20 + brain.passing * 0.15) * stylePassBias) {
        return passTarget.position.clone().lerp(enemyGoal, tacticalStyle === 'aggressive' || tacticalStyle === 'direct' ? 0.42 : 0.20);
      }

      // Condução com bola: avança no corredor menos congestionado.
      const nearest = this.getClosest(otherTeam, this.position);
      let evade = new THREE.Vector3();
      if (nearest) {
        evade = this.position.clone().sub(nearest.position);
        evade.y = 0;
        if (evade.lengthSq() > 0.01) evade.normalize().multiplyScalar((5.4 - Math.min(5.4, pressure)) * 0.82);
      }
      const laneSide = Math.sign(this.position.x || this.home.x || (Math.random() - 0.5));
      const goCentral = Math.abs(this.position.x) > CONFIG.arena.goalWidth * 0.9 && distToGoal < 28;
      return new THREE.Vector3(
        THREE.MathUtils.clamp(goCentral ? this.position.x * 0.72 : this.position.x + laneSide * (1.6 + brain.positioning * 1.2) + evade.x, -halfW, halfW),
        0,
        THREE.MathUtils.clamp(this.position.z + attackingSign * ((tacticalStyle === 'defensive' ? 3.8 : 7.2) + brain.positioning * (tacticalStyle === 'aggressive' || tacticalStyle === 'direct' ? 6.8 : 4.8)), -halfD, halfD)
      );
    }

    if (!ball.owner) {
      const predicted = ball.position.clone().addScaledVector(ball.velocity || new THREE.Vector3(), 0.18 + brain.reaction * 0.12);
      const rank = this.getTeamRankByDistance(myTeam, predicted);
      if (rank === 0) return predicted;
      if (rank === 1) return this.getReboundSpot(predicted, enemyGoal, brain);
      if (rank === 2 && brain.aggression > 0.72) return this.interceptPoint({ position: predicted, lastMoveDir: this.lastMoveDir }, arenaOwnGoalFor(this.team), brain);
      return this.getFormationSpot(predicted, phase, brain);
    }

    if (ball.owner.team === this.team) {
      const owner = ball.owner;
      if (owner === this) return enemyGoal;

      const distanceToGoal = owner.position.distanceTo(enemyGoal);
      const nearEnemyGoal = distanceToGoal < 27;
      const rankNearOwner = this.getTeamRankByDistance(myTeam.filter(p => p !== owner), owner.position);

      // Perto do gol: nunca deixa dois companheiros atrás da mesma bola.
      // 0 = opção curta; 1 = rebote/cutback; demais = abrir campo/defender transição.
      if (nearEnemyGoal) {
        if (rankNearOwner === 0 && this.role !== 'def') return this.getSupportSpot(owner, otherTeam, enemyGoal, brain);
        if (rankNearOwner === 1 || this.role === 'striker') return this.getReboundSpot(owner.position, enemyGoal, brain);
        if (this.role === 'def') return this.getFormationSpot(owner.position, 'attack', brain);
        return this.getWideAttackSpot(owner, otherTeam, enemyGoal, brain);
      }

      const pressure = this.getNearestDistance(otherTeam, owner.position);
      if (pressure < 5.2 && rankNearOwner === 0) {
        return owner.position.clone().lerp(this.getSupportSpot(owner, otherTeam, enemyGoal, brain), 0.60);
      }
      return this.getSupportSpot(owner, otherTeam, enemyGoal, brain);
    }

    const owner = ball.owner;
    const ownGoal = arenaOwnGoalFor(this.team);
    const rankToCarrier = this.getTeamRankByDistance(myTeam, owner.position);

    // Defesa organizada: um pressiona, um fecha linha do gol, o resto marca opções.
    if (rankToCarrier === 0) {
      const fromGoal = owner.position.clone().sub(ownGoal);
      fromGoal.y = 0;
      if (fromGoal.lengthSq() === 0) fromGoal.copy(owner.lastMoveDir);
      fromGoal.normalize();
      const side = new THREE.Vector3(-fromGoal.z, 0, fromGoal.x)
        .multiplyScalar(Math.sin(this.home.x + this.animTime) * (0.34 + brain.marking * 0.22));
      return owner.position.clone()
        .sub(fromGoal.multiplyScalar(CONFIG.ai.tackleDistance * (1.08 + brain.marking * 0.20)))
        .add(side);
    }

    if (rankToCarrier === 1) return this.interceptPoint(owner, ownGoal, brain);

    const mark = this.findMarkTarget(otherTeam, myTeam, brain, ownGoal);
    if (mark) {
      this.markingTarget = mark;
      return this.getMarkingSpot(mark, owner, ownGoal, brain, myTeam);
    }

    return this.getFormationSpot(ball.position, 'defense', brain);

    function arenaOwnGoalFor(team) {
      return team === 'blue'
        ? new THREE.Vector3(0, 0, CONFIG.arena.depth / 2)
        : new THREE.Vector3(0, 0, -CONFIG.arena.depth / 2);
    }
  }

  getMatchPhase(ball) {
    if (ball.owner?.team === this.team) return 'attack';
    if (ball.owner && ball.owner.team !== this.team) return 'defense';
    return 'loose';
  }

  getFormationSpot(ballPos, phase, brain) {
    const attackingSign = this.team === 'blue' ? -1 : 1;
    const halfW = CONFIG.arena.width / 2 - 6;
    const halfD = CONFIG.arena.depth / 2 - 7;
    const widthSlots = {
      striker: this.home.x * 0.55,
      wing: this.home.x || 16,
      mid: this.home.x * 0.75,
      def: this.home.x * 0.50
    };
    const drift = Math.sin(performance.now() * 0.0012 + this.home.x) * (1.25 - Math.min(1.1, brain.positioning) * 0.45);
    const x = THREE.MathUtils.clamp((widthSlots[this.role] ?? this.home.x) + drift, -halfW, halfW);
    let z = this.home.z;
    if (phase === 'attack') z = ballPos.z + attackingSign * (this.role === 'def' ? -5.0 : 8.0);
    if (phase === 'defense') z = ballPos.z - attackingSign * (this.role === 'striker' ? 2.0 : 7.0);
    if (phase === 'loose') z = this.home.z * 0.45 + ballPos.z * 0.55;
    return new THREE.Vector3(x, 0, THREE.MathUtils.clamp(z, -halfD, halfD));
  }

  getSupportSpot(owner, otherTeam, enemyGoal, brain) {
    const attackingSign = this.team === 'blue' ? -1 : 1;
    const halfW = CONFIG.arena.width / 2 - 6;
    const halfD = CONFIG.arena.depth / 2 - 7;
    const sideBase = this.home.x === 0 ? (this.position.x >= owner.position.x ? 10 : -10) : this.home.x;
    let z = owner.position.z + attackingSign * (6.5 + brain.positioning * 5.0);
    if (this.role === 'def') z = owner.position.z - attackingSign * (7.0 + brain.positioning * 2.0);
    if (this.role === 'wing') z = owner.position.z + attackingSign * (5.5 + brain.positioning * 4.0);
    let target = new THREE.Vector3(
      THREE.MathUtils.clamp(sideBase, -halfW, halfW),
      0,
      THREE.MathUtils.clamp(z, -halfD, halfD)
    );

    const nearEnemyGoal = owner.position.distanceTo(enemyGoal) < 23;
    if (nearEnemyGoal && this !== owner) {
      const offsetSide = Math.sign(this.home.x || this.position.x || 1);
      const cutback = owner.position.clone();
      cutback.x = THREE.MathUtils.clamp(offsetSide * (CONFIG.arena.goalWidth * 0.75 + 4.5), -halfW, halfW);
      cutback.z = THREE.MathUtils.clamp(owner.position.z - attackingSign * (5.0 + brain.positioning * 2.2), -halfD, halfD);
      if (this.role === 'striker' || this.role === 'wing' || this.role === 'mid') target.lerp(cutback, 0.68);
    }

    const nearest = this.getClosest(otherTeam, target);
    if (nearest) {
      const away = target.clone().sub(nearest.position);
      away.y = 0;
      if (away.length() > 0.01) target.addScaledVector(away.normalize(), brain.positioning * 2.7);
    }
    return target;
  }

  getReboundSpot(ballPos, enemyGoal, brain) {
    const attackingSign = this.team === 'blue' ? -1 : 1;
    const halfW = CONFIG.arena.width / 2 - 6;
    const halfD = CONFIG.arena.depth / 2 - 7;
    const side = Math.sign(this.home.x || this.position.x || 1);
    return new THREE.Vector3(
      THREE.MathUtils.clamp(side * (CONFIG.arena.goalWidth * 0.78 + 3.8), -halfW, halfW),
      0,
      THREE.MathUtils.clamp(ballPos.z - attackingSign * (4.8 + brain.positioning * 2.0), -halfD, halfD)
    );
  }

  getTeamRankByDistance(team, point) {
    const ordered = team
      .filter(p => p && p.hp > 0 && !p.isGoalkeeper)
      .sort((a, b) => a.position.distanceTo(point) - b.position.distanceTo(point));
    return ordered.indexOf(this);
  }

  getWideAttackSpot(owner, otherTeam, enemyGoal, brain) {
    const attackingSign = this.team === 'blue' ? -1 : 1;
    const halfW = CONFIG.arena.width / 2 - 6;
    const halfD = CONFIG.arena.depth / 2 - 7;
    const side = Math.sign(this.home.x || this.position.x || 1);
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp(side * (CONFIG.arena.goalWidth * 1.05 + 7.5), -halfW, halfW),
      0,
      THREE.MathUtils.clamp(owner.position.z + attackingSign * (this.role === 'wing' ? 4.5 : -2.5), -halfD, halfD)
    );
    const nearest = this.getClosest(otherTeam, target);
    if (nearest) {
      const away = target.clone().sub(nearest.position); away.y = 0;
      if (away.lengthSq() > 0.01) target.addScaledVector(away.normalize(), 1.4 + brain.positioning * 1.3);
    }
    return target;
  }

  interceptPoint(owner, goal, brain) {
    const toGoal = goal.clone().sub(owner.position);
    toGoal.y = 0;
    if (toGoal.lengthSq() === 0) return owner.position;
    return owner.position.clone().addScaledVector(toGoal.normalize(), 3.1 + brain.marking * 4.0);
  }

  moveTowards(dt, arena, target, allPlayers, difficulty, brain, modifiers, ball) {
    const desired = target.clone().sub(this.position);
    desired.y = 0;
    this.velocity.set(0, 0, 0);

    const distanceToTarget = desired.length();
    if (distanceToTarget > 0.18 || this.stuckTimer > 0.55) {
      if (distanceToTarget > 0.001) desired.normalize();
      else desired.copy(this.lastMoveDir.lengthSq() ? this.lastMoveDir : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)).normalize();

      const separation = new THREE.Vector3();
      const avoidRadius = 1.28 + brain.positioning * 0.18;
      for (const p of allPlayers) {
        if (p === this || p.hp <= 0) continue;
        const away = this.position.clone().sub(p.position);
        away.y = 0;
        const d = away.length();
        if (d > 0 && d < avoidRadius) separation.addScaledVector(away.normalize(), (avoidRadius - d) * 2.35);
      }

      // Se estiver perseguindo/marcando, não afasta tanto do alvo principal.
      const finalDir = desired.multiplyScalar(1.25 + brain.positioning * 0.25).add(separation.multiplyScalar(0.72)).normalize();
      this.lastMoveDir.lerp(finalDir, Math.min(1, dt * (11 + brain.reaction * 5)));
      if (this.lastMoveDir.lengthSq() > 0) this.lastMoveDir.normalize();

      let speedBoost = 1 + (brain.reaction - 0.5) * 0.28;
      if (this.stuckTimer > 0.55) speedBoost *= 1.22;
      if (this.team === 'red') speedBoost *= Math.min(1.42, difficulty);
      if (this.team === 'blue' && modifiers.bluePress > 0) speedBoost *= 1.18;
      if (this.team === 'red' && modifiers.redHighPress > 0) speedBoost *= 1.18;
      if (this.team === 'red' && modifiers.redCounter > 0 && ball.owner?.team === 'red') speedBoost *= 1.2;

      this.velocity.copy(this.lastMoveDir).multiplyScalar(this.aiSpeed * speedBoost);
      this.position.addScaledVector(this.velocity, dt);
      arena.clampPosition(this.position, this.radius);
      if (this.actionTimer <= 0) this.action = 'run';
    } else if (this.actionTimer <= 0) {
      // Mesmo parado, olha para a bola para parecer vivo e atento.
      const look = ball.position.clone().sub(this.position); look.y = 0;
      if (look.lengthSq() > 0.02) this.lastMoveDir.lerp(look.normalize(), Math.min(1, dt * 5));
      this.action = 'idle';
    }
  }

  tryInteractWithBall(ball, arena, myTeam, otherTeam, enemyGoal, difficulty, brain, modifiers, tacticalStyle = 'balanced') {
    if (ball.owner !== this || !this.canShoot() || this.decisionTimer > 0) return;
    this.decisionTimer = Math.max(0.06, CONFIG.ai.decisionCooldown * (1.15 - brain.reaction * 0.55));

    const distToGoal = this.position.distanceTo(enemyGoal);
    const openShot = this.hasClearLane(enemyGoal, otherTeam, 2.35 - brain.vision * 0.65);
    const goalAngleGood = Math.abs(this.position.x) < CONFIG.arena.goalWidth * (0.75 + brain.shooting * 0.12);
    const styleShotBoost = tacticalStyle === 'aggressive' || tacticalStyle === 'direct' ? 8.5 : tacticalStyle === 'defensive' ? -4.5 : 0;
    const shouldShoot = distToGoal < CONFIG.ai.shotDistance + brain.shooting * 7.0 + styleShotBoost && (openShot || goalAngleGood || brain.shooting > 1.00 || tacticalStyle === 'direct');

    if (shouldShoot) {
      const aimError = Math.max(0.015, (1.18 - brain.shooting) * 0.13);
      const target = enemyGoal.clone();
      target.x += (Math.random() - 0.5) * CONFIG.arena.goalWidth * Math.max(0.15, 0.55 - brain.shooting * 0.18);
      const dir = target.sub(this.position).normalize();
      dir.x += (Math.random() - 0.5) * aimError;
      ball.kick(this, dir.normalize(), (this.kickPower || CONFIG.ai.kickPower) * (this.team === 'red' ? Math.min(1.35, difficulty) : 1.05), 0.42);
      this.playKickAnimation();
      this.markShot();
      return;
    }

    const passTarget = this.findBestPass(myTeam, otherTeam, enemyGoal, brain);
    const nearestPressure = this.getNearestDistance(otherTeam, this.position);
    const passBias = tacticalStyle === 'passing' ? 0.64 : tacticalStyle === 'defensive' ? 0.42 : tacticalStyle === 'aggressive' || tacticalStyle === 'direct' ? 0.14 : 0.28;
    const mustRelease = nearestPressure < 4.3 + brain.vision * 1.1;
    if (passTarget && (mustRelease || Math.random() < passBias + brain.passing * 0.10)) {
      ball.pass(this, passTarget, (this.passPower || CONFIG.ai.passPower) + this.position.distanceTo(passTarget.position) * 0.39);
      this.playPassAnimation();
      this.markShot(0.75);
      return;
    }

    // Pequeno toque/condução quando não há chute ou passe claro.
    const carry = enemyGoal.clone().sub(this.position).normalize();
    const pressure = this.getNearestDistance(otherTeam, this.position);
    if (pressure < 2.8 || Math.random() < (tacticalStyle === 'direct' || tacticalStyle === 'aggressive' ? 0.16 : 0.07) + brain.shooting * 0.05) {
      ball.kick(this, carry, (this.kickPower || CONFIG.ai.kickPower) * 0.50, 0.18);
      this.markShot(0.95);
    }
  }

  tryTackle(ball, brain, modifiers) {
    if (!ball.owner || ball.owner.team === this.team) return;
    if (this.tackleCooldown > 0 || ball.ownerLockTimer > 0) return;

    const carrier = ball.owner;
    const dist = this.position.distanceTo(carrier.position);
    const range = CONFIG.ai.tackleDistance + brain.aggression * 0.18;
    if (dist > range) return;

    this.tackleCooldown = CONFIG.ai.tackleCooldown * THREE.MathUtils.clamp(1.2 - brain.reaction * 0.42, 0.55, 1.15);
    this.playStealAnimation?.();

    const isEnemyTeam = this.team === 'red';
    const damageBoost = isEnemyTeam && modifiers.redTackleBoost > 0 ? 1.45 : 1;
    if (carrier.team === 'blue') carrier.takeDamage(CONFIG.ai.enemyDamage * damageBoost);

    const dir = carrier.position.clone().sub(this.position);
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.copy(this.lastMoveDir);
    dir.normalize();

    const stealChance = 0.18 + brain.marking * 0.22 + brain.aggression * 0.14 + (modifiers.redTackleBoost && isEnemyTeam ? 0.14 : 0);
    if (Math.random() < stealChance) {
      ball.setOwner(this, CONFIG.ball.stealLock);
    } else if (Math.random() < 0.38 + brain.aggression * 0.14) {
      ball.pokeLoose(this, dir, 5.2 + brain.aggression * 4);
    }
  }

  receiveCall(ball, caller) {
    if (ball.owner === this && this.team === caller.team && this.canShoot()) {
      ball.pass(this, caller, (this.passPower || CONFIG.ai.passPower) + this.position.distanceTo(caller.position) * 0.35);
      this.playPassAnimation();
      this.markShot(0.8);
      return true;
    }
    return false;
  }

  findBestPass(myTeam, otherTeam, enemyGoal, brain) {
    let best = null;
    let bestScore = -Infinity;
    for (const mate of myTeam) {
      if (mate === this || mate.hp <= 0 || mate.isGoalkeeper) continue;
      const forwardBonus = this.team === 'blue' ? this.position.z - mate.position.z : mate.position.z - this.position.z;
      const distGoal = mate.position.distanceTo(enemyGoal);
      const pressure = this.getNearestDistance(otherTeam, mate.position);
      const laneClear = this.hasClearLane(mate.position, otherTeam, 1.95 - brain.vision * 0.45) ? 7.5 : -9.0;
      const spacing = this.position.distanceTo(mate.position);
      const notTooClose = spacing > 5 ? 2.0 : -3.0;
      const underMarker = pressure < 2.4 ? -5.5 : pressure * 0.42;
      const roleBonus = mate.role === 'wing' ? 1.2 : mate.role === 'striker' ? 1.7 : mate.role === 'def' ? 0.35 : 0.8;
      const score =
        forwardBonus * (0.82 + brain.passing * 0.58) -
        distGoal * 0.040 +
        underMarker +
        laneClear -
        spacing * 0.018 +
        notTooClose +
        roleBonus +
        brain.vision * 2.2;
      if (score > bestScore) { bestScore = score; best = mate; }
    }
    return bestScore > (-0.25 - brain.passing * 0.85) ? best : null;
  }

  findMarkTarget(otherTeam, myTeam, brain, ownGoal = null) {
    let best = null;
    let bestValue = -Infinity;
    for (const enemy of otherTeam) {
      if (enemy.hp <= 0 || enemy.isGoalkeeper) continue;
      const assignedCount = this.getAssignedMarkers(myTeam, enemy);
      const alreadyCloser = myTeam.some(m => m !== this && m.hp > 0 && !m.isGoalkeeper && m.position.distanceTo(enemy.position) + 0.8 < this.position.distanceTo(enemy.position));
      const distance = this.position.distanceTo(enemy.position);
      const dangerToGoal = ownGoal ? Math.max(0, 38 - enemy.position.distanceTo(ownGoal)) : 0;
      const forwardDanger = this.team === 'blue' ? enemy.position.z : -enemy.position.z;
      const hasBallBonus = enemy === this.markingTarget ? 1.4 : 0;
      const roleDanger = enemy.role === 'striker' ? 2.8 : enemy.role === 'wing' ? 1.7 : 1.0;
      const value =
        dangerToGoal * 0.22 +
        forwardDanger * 0.16 -
        distance * 0.24 -
        assignedCount * 5.2 -
        (alreadyCloser ? 1.1 : 0) +
        hasBallBonus +
        roleDanger +
        brain.marking * 2.6;
      if (value > bestValue) { bestValue = value; best = enemy; }
    }
    return best;
  }


  getAssignedMarkers(myTeam, enemy) {
    let count = 0;
    for (const mate of myTeam) {
      if (mate === this || mate.hp <= 0 || mate.isGoalkeeper) continue;
      if (mate.markingTarget === enemy || mate.position.distanceTo(enemy.position) < 3.4) count++;
    }
    return count;
  }

  getMarkingSpot(mark, ballCarrier, ownGoal, brain, myTeam) {
    const toGoal = ownGoal.clone().sub(mark.position);
    toGoal.y = 0;
    if (toGoal.lengthSq() === 0) toGoal.set(0, 0, this.team === 'blue' ? 1 : -1);
    toGoal.normalize();

    const carrierInfluence = ballCarrier?.position ? ballCarrier.position.clone().sub(mark.position) : new THREE.Vector3();
    carrierInfluence.y = 0;
    if (carrierInfluence.lengthSq() > 0.01) carrierInfluence.normalize();

    const sideSign = Math.sign(this.home.x || this.position.x || 1);
    const side = new THREE.Vector3(-toGoal.z, 0, toGoal.x).multiplyScalar(sideSign * (0.75 + brain.marking * 0.28));
    const coverDepth = 2.2 + brain.marking * 2.4;

    const spot = mark.position.clone()
      .addScaledVector(toGoal, coverDepth)
      .addScaledVector(carrierInfluence, 0.65)
      .add(side);

    // Se dois companheiros estão muito próximos, abre uma sombra de marcação.
    const crowd = myTeam.filter(m => m !== this && !m.isGoalkeeper && m.position.distanceTo(spot) < 2.2).length;
    if (crowd > 0) spot.addScaledVector(side.normalize(), crowd * 1.25);
    return spot;
  }

  getAntiStuckTarget(ball, myTeam, otherTeam, arena, brain) {
    const halfW = CONFIG.arena.width / 2 - 6;
    const halfD = CONFIG.arena.depth / 2 - 7;
    const sign = this.team === 'blue' ? -1 : 1;
    const nearestOpponent = this.getClosest(otherTeam, this.position);
    const nearestMate = this.getClosest(myTeam.filter(p => p !== this), this.position);
    let target = this.position.clone();

    if (ball.owner?.team !== this.team && nearestOpponent) {
      const ownGoal = arena.getOwnGoalCenter(this.team);
      target = this.getMarkingSpot(nearestOpponent, ball.owner, ownGoal, brain, myTeam);
    } else if (ball.owner?.team === this.team) {
      target = this.getSupportSpot(ball.owner, otherTeam, arena.getGoalCenter(this.team), brain);
    } else {
      target.copy(ball.position).add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, sign * (Math.random() * 4 - 2)));
    }

    if (nearestMate && nearestMate.position.distanceTo(target) < 2.0) {
      target.x += Math.sign(this.home.x || this.position.x || 1) * 3.2;
    }
    target.x = THREE.MathUtils.clamp(target.x, -halfW, halfW);
    target.z = THREE.MathUtils.clamp(target.z, -halfD, halfD);
    return target;
  }

  hasClearLane(target, opponents, clearance = 1.7) {
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
    let best = null, bestDist = Infinity;
    for (const item of list) {
      if (item.hp <= 0) continue;
      const d = item.position.distanceTo(pos);
      if (d < bestDist) { bestDist = d; best = item; }
    }
    return best;
  }

  getNthClosest(list, pos, n = 1) {
    return [...list].filter(p => p.hp > 0).sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos))[n] || null;
  }

  getNearestDistance(list, pos) {
    let best = Infinity;
    for (const item of list) {
      if (item.hp > 0) best = Math.min(best, item.position.distanceTo(pos));
    }
    return best;
  }
}
