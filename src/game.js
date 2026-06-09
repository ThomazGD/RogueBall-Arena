import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { CONFIG } from './config.js';
import { Input } from './input.js';
import { Arena } from './arena.js';
import { Ball } from './ball.js';
import { AIPlayer } from './aiPlayer.js';
import { Goalkeeper } from './goalkeeper.js';
import { UpgradeManager } from './upgradeManager.js';
import { CardManager } from './cardManager.js';
import { UI } from './ui.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08111e);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.aimPoint = new THREE.Vector3(0, 0, -1);

    this.input = new Input(canvas);
    this.ui = new UI();
    this.upgrades = new UpgradeManager();
    this.cards = new CardManager();

    this.state = 'menu';
    this.round = 1;
    this.timeLeft = this.initialSettings?.roundSeconds || CONFIG.roundSeconds;
    this.difficulty = 1;
    this.controlledIndex = 0;
    this.callCooldown = 0;
    this.loopStarted = false;
    this.blueCount = CONFIG.team.startBlueCount;
    this.redCount = CONFIG.team.startRedCount;
    this.switchTargetIndex = 0;
    this.lastEnemyCard = null;
    this.lastPlayerCard = null;
    this.enemyScore = 0;
    this.cameraMode = CONFIG.camera?.defaultMode || 'broadcast';
    this.tacticalStyle = 'balanced'; // balanced | aggressive | defensive | passing
    this.pendingRecruits = { blue: 0, red: 0 };
    this.initialSettings = { cameraMode: CONFIG.camera?.defaultMode || 'broadcast', tacticalStyle: 'balanced', difficultyPreset: 'normal', roundSeconds: CONFIG.roundSeconds };

    const diffMul = this.getDifficultyMultiplier();
    this.teamBrains = {
      blue: { ...CONFIG.ai.baseBrain },
      red: Object.fromEntries(Object.entries(CONFIG.ai.baseBrain).map(([k, v]) => [k, Math.min(1.18, v * (0.98 + (diffMul - 1) * 0.55))]))
    };
    this.goalieBrains = {
      blue: { ...CONFIG.goalkeeper.baseBrain },
      red: Object.fromEntries(Object.entries(CONFIG.goalkeeper.baseBrain).map(([k, v]) => [k, Math.min(1.14, v * (0.98 + (diffMul - 1) * 0.45))]))
    };
    this.modifiers = this.blankModifiers();

    this.setupLights();
    this.arena = new Arena(this.scene);
    this.ball = new Ball(this.scene);
    this.allies = [];
    this.enemies = [];
    this.goalkeepers = [];
    this.spawnTeams();
    this.player = this.allies[this.controlledIndex];
    this.firstPersonHiddenPlayer = null;

    window.addEventListener('resize', () => this.resize());
    this.setupTacticalControls();
  }

  configure(settings = {}) {
    this.initialSettings = {
      ...this.initialSettings,
      ...settings,
      roundSeconds: Number(settings.roundSeconds || this.initialSettings.roundSeconds || CONFIG.roundSeconds)
    };
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.clock.getDelta();
    this.flashText('Partida retomada', 24, 650);
  }

  getDifficultyMultiplier() {
    const preset = this.initialSettings?.difficultyPreset || 'normal';
    if (preset === 'easy') return 0.88;
    if (preset === 'hard') return 1.12;
    return 1;
  }

  blankModifiers() {
    return {
      blueGoldenGoal: false,
      bluePress: 0,
      redHighPress: 0,
      redTackleBoost: 0,
      redCounter: 0
    };
  }

  setupTacticalControls() {
    const buttons = document.querySelectorAll('[data-tactic]');
    if (!buttons?.length) return;
    const apply = (style) => {
      this.tacticalStyle = style || 'balanced';
      buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.tactic === this.tacticalStyle));
      const names = { balanced: 'Equilibrado', aggressive: 'Agressivo', defensive: 'Defensivo', passing: 'Toque de bola' };
      if (this.state === 'playing') this.flashText(`Estilo: ${names[this.tacticalStyle]}`, 22, 520);
    };
    buttons.forEach(btn => btn.addEventListener('click', () => apply(btn.dataset.tactic)));
    apply(this.tacticalStyle);
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0x9fc9ff, 0x122015, 1.3);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.25);
    sun.position.set(14, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.scene.add(sun);
  }

  getFormation(team, count) {
    // Formação recalculada para o campo maior.
    // Azul ataca para o norte (-Z); vermelho ataca para o sul (+Z).
    const blue = [
      { x: -5.5, z: 25, role: 'mid', name: 'Capitão' },
      { x: 5.5, z: 25, role: 'striker', name: 'Parceiro' },
      { x: -18, z: 12, role: 'wing', name: 'Ala Esquerdo' },
      { x: 18, z: 12, role: 'wing', name: 'Ala Direito' },
      { x: -9, z: 34, role: 'def', name: 'Defensor' },
      { x: 9, z: 34, role: 'def', name: 'Volante' }
    ];
    const red = [
      { x: -5.5, z: -25, role: 'mid', name: 'Rival 10' },
      { x: 5.5, z: -25, role: 'striker', name: 'Rival 9' },
      { x: -18, z: -12, role: 'wing', name: 'Ponta Rival' },
      { x: 18, z: -12, role: 'wing', name: 'Ponta Rival' },
      { x: -9, z: -34, role: 'def', name: 'Zagueiro' },
      { x: 9, z: -34, role: 'def', name: 'Volante Rival' }
    ];
    return (team === 'blue' ? blue : red).slice(0, count);
  }

  spawnTeams() {
    for (const p of [...this.allies, ...this.enemies, ...this.goalkeepers]) this.scene.remove(p.mesh);
    this.allies = [];
    this.enemies = [];
    this.goalkeepers = [];

    const bluePositions = this.getFormation('blue', this.blueCount);
    const redPositions = this.getFormation('red', this.redCount);

    bluePositions.forEach((pos, i) => {
      this.allies.push(new AIPlayer(this.scene, {
        team: 'blue',
        isUser: i === 0,
        isControlled: i === this.controlledIndex,
        name: i === 0 ? 'Você' : pos.name,
        number: i === 0 ? 10 : (7 + i * 4),
        role: pos.role,
        x: pos.x,
        z: pos.z,
        color: i === 0 ? 0x2f7cff : 0x4aa3ff,
        speed: CONFIG.ai.speed * 1.00,
        brain: this.teamBrains.blue
      }));
    });

    redPositions.forEach((pos, i) => {
      this.enemies.push(new AIPlayer(this.scene, {
        team: 'red',
        name: pos.name,
        number: 9 + i * 3,
        role: pos.role,
        x: pos.x,
        z: pos.z,
        color: 0xff3d45,
        speed: CONFIG.ai.speed * 0.99 + this.round * 0.035,
        brain: this.teamBrains.red
      }));
    });

    this.spawnGoalkeepers();

    this.controlledIndex = Math.min(this.controlledIndex, this.allies.length - 1);
    this.setControlledPlayer(this.controlledIndex);
    this.updateSwitchPreview();
  }

  spawnGoalkeepers() {
    const blueHome = this.arena.getKeeperHome('blue');
    const redHome = this.arena.getKeeperHome('red');

    this.goalkeepers.push(new Goalkeeper(this.scene, {
      team: 'blue',
      name: 'Goleiro Azul',
      number: 1,
      x: blueHome.x,
      z: blueHome.z,
      color: 0x19b7ff,
      speed: CONFIG.goalkeeper.speed,
      brain: this.goalieBrains.blue
    }));

    this.goalkeepers.push(new Goalkeeper(this.scene, {
      team: 'red',
      name: 'Goleiro Rival',
      number: 1,
      x: redHome.x,
      z: redHome.z,
      color: 0xffb000,
      speed: CONFIG.goalkeeper.speed * 0.99 + this.round * 0.025,
      brain: this.goalieBrains.red
    }));
  }

  setControlledPlayer(index) {
    this.controlledIndex = index;
    this.allies.forEach((p, i) => p.setControlled(i === index));
    this.player = this.allies[index];
  }

  start() {
    this.state = 'playing';
    this.round = 1;
    this.timeLeft = this.initialSettings?.roundSeconds || CONFIG.roundSeconds;
    this.difficulty = 1;
    this.controlledIndex = 0;
    this.callCooldown = 0;
    this.blueCount = CONFIG.team.startBlueCount;
    this.redCount = CONFIG.team.startRedCount;
    const diffMul = this.getDifficultyMultiplier();
    this.teamBrains = {
      blue: { ...CONFIG.ai.baseBrain },
      red: Object.fromEntries(Object.entries(CONFIG.ai.baseBrain).map(([k, v]) => [k, Math.min(1.18, v * (0.98 + (diffMul - 1) * 0.55))]))
    };
    this.goalieBrains = {
      blue: { ...CONFIG.goalkeeper.baseBrain },
      red: Object.fromEntries(Object.entries(CONFIG.goalkeeper.baseBrain).map(([k, v]) => [k, Math.min(1.14, v * (0.98 + (diffMul - 1) * 0.45))]))
    };
    this.modifiers = this.blankModifiers();
    this.lastEnemyCard = null;
    this.lastPlayerCard = null;
    this.enemyScore = 0;
    this.cameraMode = this.initialSettings?.cameraMode || CONFIG.camera?.defaultMode || 'broadcast';
    this.tacticalStyle = this.initialSettings?.tacticalStyle || 'balanced';
    this.pendingRecruits = { blue: 0, red: 0 };
    this.spawnTeams();
    for (const p of [...this.allies, ...this.enemies, ...this.goalkeepers]) {
      p.hp = p.maxHp;
      p.energy = p.maxEnergy;
      p.score = 0;
      p.xp = 0;
      p.level = 1;
      p.position.copy(p.home);
      p.syncMesh(0.016);
    }
    this.ball.reset();
    this.ui.showPlaying();
    this.clock.getDelta();
    if (!this.loopStarted) {
      this.loopStarted = true;
      this.loop();
    }
    this.flashText('RogueBall começou!', 34, 1200);
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.033);
    if (this.state === 'playing') this.update(dt);
    this.render();
  }

  update(dt) {
    this.timeLeft -= dt;
    this.callCooldown = Math.max(0, this.callCooldown - dt);
    if (this.timeLeft <= 0) return this.endRound();

    this.updateAimPoint();
    this.updateSwitchPreview();
    this.handleSwitchPlayer();
    this.handleCameraMode();
    this.player.updateUser(dt, this.input, this.arena);

    const players = [...this.allies, ...this.enemies, ...this.goalkeepers];
    for (const ally of this.allies) {
      if (ally !== this.player) {
        ally.updateAI(dt, {
          arena: this.arena,
          ball: this.ball,
          controlled: this.player,
          allies: this.allies,
          enemies: this.enemies,
          allPlayers: players,
          difficulty: 1,
          modifiers: this.modifiers,
          teamBrains: this.teamBrains,
          tacticalStyle: this.tacticalStyle
        });
      }
    }

    for (const enemy of this.enemies) {
      enemy.updateAI(dt, {
        arena: this.arena,
        ball: this.ball,
        controlled: this.player,
        allies: this.allies,
        enemies: this.enemies,
        allPlayers: players,
        difficulty: Math.min(this.difficulty, 1.16),
        modifiers: this.modifiers,
        teamBrains: this.teamBrains,
        tacticalStyle: 'direct'
      });
    }

    for (const keeper of this.goalkeepers) {
      keeper.updateGoalkeeper(dt, {
        arena: this.arena,
        ball: this.ball,
        allies: this.allies,
        enemies: this.enemies,
        allPlayers: players,
        difficulty: this.difficulty,
        goalieBrains: this.goalieBrains
      });
    }

    this.handleAutomaticHeaders(players);
    this.handlePlayerActions();
    this.resolvePlayerSpacing(players);
    this.ball.update(dt, this.arena, players);

    // Defesa emergencial depois que a bola se moveu.
    // Isso evita o bug de chute rápido atravessar o goleiro entre dois frames.
    for (const keeper of this.goalkeepers) {
      const teamBrain = this.goalieBrains?.[keeper.team] || {};
      keeper.trySave(this.ball, this.arena, keeper.mixBrain(teamBrain));
      keeper.updateGoalkeeperFacing(this.ball, this.arena);
      keeper.syncMesh(dt);
    }

    this.checkScores();
    this.updateCamera(dt);
    this.ui.updateHUD(this.player, this.round, this.timeLeft, this.ball.owner, this.allies.length, this.enemies.length, this.teamBrains, this.lastPlayerCard, this.lastEnemyCard, this.goalieBrains, this.enemyScore);
    this.ui.updateTacticalLine({ cameraMode: this.cameraMode, blueBrain: this.teamBrains.blue, redBrain: this.teamBrains.red, goalieBrains: this.goalieBrains, ballOwner: this.ball.owner, tacticalStyle: this.tacticalStyle });
    this.ui.drawMiniMap({ arena: this.arena, ball: this.ball, allies: this.allies, enemies: this.enemies, goalkeepers: this.goalkeepers, controlled: this.player });

    if (this.allies.every(p => p.hp <= 0)) {
      this.state = 'gameover';
      this.ui.showGameOver(this.getTeamScore(), this.round);
    }
  }

  updateAimPoint() {
    this.raycaster.setFromCamera(this.input.mouse, this.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.aimPoint);
  }

  getAimDirection() {
    const dir = this.aimPoint.clone().sub(this.player.position);
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.copy(this.player.lastMoveDir);
    return dir.normalize();
  }

  getSwitchCandidateIndex() {
    if (this.allies.length <= 1) return this.controlledIndex;
    const move = this.input.getMoveVector();
    if (move.lengthSq() > 0) {
      let bestIndex = (this.controlledIndex + 1) % this.allies.length;
      let bestScore = -Infinity;
      for (let i = 0; i < this.allies.length; i++) {
        if (i === this.controlledIndex || this.allies[i].hp <= 0) continue;
        const to = this.allies[i].position.clone().sub(this.player.position);
        to.y = 0;
        if (to.lengthSq() === 0) continue;
        const dist = to.length();
        const alignment = move.dot(to.normalize());
        const score = alignment * 4 - dist * 0.035;
        if (score > bestScore) { bestScore = score; bestIndex = i; }
      }
      return bestIndex;
    }
    let next = (this.controlledIndex + 1) % this.allies.length;
    let guard = 0;
    while (this.allies[next].hp <= 0 && guard < this.allies.length) {
      next = (next + 1) % this.allies.length;
      guard++;
    }
    return next;
  }

  updateSwitchPreview() {
    this.switchTargetIndex = this.getSwitchCandidateIndex();
    this.allies.forEach((p, i) => p.setSwitchTarget(i === this.switchTargetIndex));
  }

  handleSwitchPlayer() {
    if (!this.input.consumeSwitchPlayer()) return;
    const targetIndex = this.getSwitchCandidateIndex();
    if (targetIndex === this.controlledIndex) return;
    this.setControlledPlayer(targetIndex);
    this.updateSwitchPreview();
    this.flashText(`Controlando: ${this.player.name}`, 28, 520);
  }


  handleCameraMode() {
    const mode = this.input.consumeCameraMode?.();
    if (!mode) return;
    this.cameraMode = mode;
    const labels = { follow: 'Jogador', broadcast: 'Transmissão/FIFA', ball: 'Bola', firstPerson: 'Visão do jogador' };
    this.flashText(`Câmera: ${labels[mode] || mode}`, 24, 520);
  }

  handlePlayerActions() {
    const hasBall = this.ball.owner === this.player;

    const dribble = this.input.consumeDribble?.();
    if (dribble && hasBall) {
      this.performUserDribble(dribble);
      return;
    }

    const shootRelease = this.input.consumeShootRelease?.();
    if (shootRelease && hasBall && this.player.canShoot()) {
      const direction = this.getAimDirection();
      const charge = shootRelease.curve ?? shootRelease.charge ?? 0;
      const wantsHighShot = this.input.isDown('w') || charge > 0.58;
      const wantsLowShot = this.input.isDown('s') && charge < 0.72;
      const power = this.player.kickPower * (0.62 + charge * 0.98);
      let lift = wantsLowShot ? 0.28 + charge * 0.75 : (wantsHighShot ? 1.65 + charge * 7.25 : 0.58 + charge * 2.4);
      lift = THREE.MathUtils.clamp(lift, 0.22, 8.35);
      this.ball.kick(this.player, direction, power, lift, wantsHighShot ? 'highKick' : 'kick');
      this.player.markShot(0.72 + charge * 0.44);
      this.pulseActionText(wantsHighShot ? 'CHUTE ALTO!' : (charge > 0.72 ? 'CHUTE FORTE!' : 'Chute'), charge);
      return;
    }

    const passRelease = this.input.consumePassRelease?.();
    if (passRelease && hasBall && this.player.canShoot()) {
      const charge = passRelease.curve ?? passRelease.charge ?? 0;
      const targetData = this.findBestPassTarget(charge);
      if (targetData?.player) {
        const target = targetData.player;
        const distance = this.player.position.distanceTo(target.position);
        const power = this.player.passPower * (0.66 + charge * 0.88) + distance * (0.22 + charge * 0.25);

        // Passe em profundidade: segurar M2, ou mirar/W na frente, joga a bola no espaço.
        if (targetData.point) {
          this.ball.passToPoint(this.player, targetData.point, power, 0.18 + charge * 0.12);
          this.pulseActionText('PASSE EM PROFUNDIDADE', charge);
        } else {
          this.ball.pass(this.player, target, power);
          this.pulseActionText(charge > 0.7 ? 'PASSE FORTE' : 'Passe', charge);
        }
        this.player.markShot(0.55 + charge * 0.35);
      }
      return;
    }

    this.updateChargeHUD();

    if (this.input.consumeHeader?.()) {
      if (this.tryUserHeader()) return;
      this.tryUserSteal(false);
      return;
    }

    if (this.input.consumeSteal()) {
      this.tryUserSteal(false);
      return;
    }

    if (this.input.consumeSlide()) {
      this.tryUserSteal(true);
      return;
    }

    if (this.input.consumeCallBall() && this.callCooldown <= 0) {
      this.player.playCallAnimation();
      this.callCooldown = CONFIG.player.callCooldown;
      const owner = this.ball.owner;
      if (owner && owner.team === 'blue' && owner !== this.player && owner.receiveCall?.(this.ball, this.player)) {
        this.flashText('Passe pedido!', 32, 480);
      } else {
        this.flashText('Pede a bola!', 28, 420);
      }
    }
  }

  updateChargeHUD() {
    const state = this.input.getChargeState?.();
    const wrap = document.getElementById('chargeHud');
    const label = document.getElementById('chargeLabel');
    const bar = document.getElementById('chargeBar');
    if (!wrap || !label || !bar || !state) return;

    const active = state.shootHeld || state.passHeld;
    wrap.classList.toggle('hidden', !active);
    if (!active) return;

    const value = state.shootHeld ? state.shoot : state.pass;
    label.textContent = state.shootHeld ? 'Força do chute' : 'Força do passe';
    bar.style.width = `${Math.round(value * 100)}%`;
  }

  pulseActionText(text, charge = 0) {
    if (charge < 0.35) return;
    const size = 22 + Math.round(charge * 16);
    this.flashText(text, size, 420);
  }

  performUserDribble(dribble) {
    const p = this.player;
    if (!p || p.energy < 12 || p.dribbleTimer > 0) return;

    const forward = p.facingDir?.clone?.() || p.lastMoveDir.clone();
    forward.y = 0;
    if (forward.lengthSq() === 0) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();

    let dir = forward.clone();
    if (dribble.kind === 'back') dir.multiplyScalar(-1);
    if (dribble.kind === 'left') dir.copy(right).multiplyScalar(-1);
    if (dribble.kind === 'right') dir.copy(right);
    if (dribble.kind === 'neutral') dir.copy(right).multiplyScalar(Math.random() < 0.5 ? -1 : 1);

    // Não é teleporte: agora o player faz um arranque animado por alguns frames.
    const distance = dribble.kind === 'back' ? 2.05 : dribble.kind === 'forward' ? 3.05 : 2.65;
    const duration = dribble.kind === 'back' ? 0.38 : 0.42;
    p.energy = Math.max(0, p.energy - (dribble.kind === 'forward' ? 15 : 12));
    p.lastMoveDir.copy(dir);
    p.facingDir.copy(dir);
    p.startDribble?.(dribble.kind, dir, distance, duration);
    this.ball.ownerLockTimer = Math.max(this.ball.ownerLockTimer || 0, 0.18);

    if (this.ball.owner === p) {
      this.ball.position.copy(p.position).addScaledVector(dir, CONFIG.ball.ownerOffset * 1.04);
      this.ball.position.y = this.ball.radius;
    }
  }


  tryUserHeader() {
    const p = this.player;
    if (!p || p.hp <= 0 || !p.canShoot?.()) return false;
    return this.tryHeaderForPlayer(p, true);
  }

  handleAutomaticHeaders(players) {
    if (this.ball.owner) return;
    if (!this.ball.velocity || this.ball.velocity.length() < 1.2) return;
    const h = this.ball.position.y;
    if (h < 1.25 || h > CONFIG.arena.goalHeight + 0.65) return;
    if (this.ball.lastKickInfo?.type === 'header' && this.ball.lastKickInfo.age < 0.36) return;

    let best = null;
    let bestScore = -Infinity;
    for (const p of players) {
      if (!p || p === this.player || p.isGoalkeeper || p.hp <= 0 || !p.canShoot?.()) continue;
      const dx = this.ball.position.x - p.position.x;
      const dz = this.ball.position.z - p.position.z;
      const flat = Math.sqrt(dx * dx + dz * dz);
      if (flat > 1.55) continue;
      const enemyGoal = this.arena.getGoalCenter(p.team);
      const attackProgress = p.team === 'blue'
        ? THREE.MathUtils.clamp((this.arena.depth / 2 - p.position.z) / this.arena.depth, 0, 1)
        : THREE.MathUtils.clamp((p.position.z + this.arena.depth / 2) / this.arena.depth, 0, 1);
      const toGoal = Math.max(0, 36 - p.position.distanceTo(enemyGoal)) * 0.06;
      const score = (1.8 - flat) * 5 + attackProgress * 2.2 + toGoal + Math.random() * 0.35;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (best) this.tryHeaderForPlayer(best, false);
  }

  tryHeaderForPlayer(player, isUser = false) {
    if (this.ball.owner) return false;
    const ballHeight = this.ball.position.y;
    if (ballHeight < 1.10 || ballHeight > CONFIG.arena.goalHeight + 0.80) return false;

    const dx = this.ball.position.x - player.position.x;
    const dz = this.ball.position.z - player.position.z;
    const flatDistance = Math.sqrt(dx * dx + dz * dz);
    const reach = isUser ? 1.70 : 1.52;
    if (flatDistance > reach) return false;

    const enemyGoal = this.arena.getGoalCenter(player.team);
    const myTeam = player.team === 'blue' ? this.allies : this.enemies;
    const otherTeam = player.team === 'blue' ? this.enemies : this.allies;
    const distToGoal = player.position.distanceTo(enemyGoal);
    const openHeader = this.hasLaneFromPlayer?.(player, enemyGoal, otherTeam, 2.0) ?? true;

    let dir;
    let power;
    let lift;
    let text = 'Cabeceio!';

    if (isUser) {
      dir = this.getAimDirection();
      const aimToGoal = dir.dot(enemyGoal.clone().sub(player.position).setY(0).normalize());
      const attackingHeader = distToGoal < 30 && aimToGoal > 0.35;
      power = attackingHeader ? 19.5 : 14.0;
      lift = attackingHeader ? 1.05 : 0.58;
    } else {
      const brain = this.teamBrains[player.team] || CONFIG.ai.baseBrain;
      const angleGood = Math.abs(player.position.x) < CONFIG.arena.goalWidth * 0.86;
      const shouldFinish = distToGoal < 24 && (openHeader || angleGood) && Math.random() < (0.38 + brain.shooting * 0.32);
      if (shouldFinish) {
        const target = enemyGoal.clone();
        target.x += (Math.random() - 0.5) * CONFIG.arena.goalWidth * Math.max(0.20, 0.62 - brain.shooting * 0.22);
        dir = target.sub(player.position).setY(0).normalize();
        power = 17.2 + brain.shooting * 7.0;
        lift = 0.85 + Math.random() * 0.7;
      } else {
        const mate = this.findHeaderPassOption(player, myTeam, otherTeam, enemyGoal);
        if (!mate) return false;
        dir = mate.position.clone().sub(player.position).setY(0).normalize();
        power = 10.5 + player.position.distanceTo(mate.position) * 0.34;
        lift = 0.42;
        text = 'Cabeceou para o passe';
      }
    }

    if (!dir || dir.lengthSq() < 0.001) return false;
    this.ball.header(player, dir, power, lift, 'header');
    player.playHeaderAnimation?.();
    player.markShot?.(0.78);
    if (isUser) this.flashText(text, 26, 420);
    return true;
  }

  findHeaderPassOption(player, myTeam, otherTeam, enemyGoal) {
    let best = null;
    let bestScore = -Infinity;
    for (const mate of myTeam) {
      if (!mate || mate === player || mate.isGoalkeeper || mate.hp <= 0) continue;
      const dist = player.position.distanceTo(mate.position);
      if (dist < 2.2 || dist > 24) continue;
      const pressure = this.getNearestDistanceToTeam(mate.position, otherTeam);
      const forward = player.team === 'blue' ? player.position.z - mate.position.z : mate.position.z - player.position.z;
      const goalBonus = Math.max(0, 34 - mate.position.distanceTo(enemyGoal)) * 0.05;
      const roleBonus = mate.role === 'striker' ? 1.5 : mate.role === 'mid' ? 1.0 : 0.3;
      const score = pressure * 0.35 + forward * 0.10 - dist * 0.06 + goalBonus + roleBonus;
      if (score > bestScore) { bestScore = score; best = mate; }
    }
    return bestScore > -1.5 ? best : null;
  }

  getNearestDistanceToTeam(pos, team) {
    let best = Infinity;
    for (const p of team) {
      if (!p || p.hp <= 0) continue;
      best = Math.min(best, p.position.distanceTo(pos));
    }
    return best;
  }

  hasLaneFromPlayer(player, target, blockers, width = 2.0) {
    const a = player.position;
    const b = target;
    const ab = b.clone().sub(a); ab.y = 0;
    const lenSq = ab.lengthSq();
    if (lenSq <= 0.001) return true;
    for (const block of blockers) {
      if (!block || block.hp <= 0) continue;
      const ap = block.position.clone().sub(a); ap.y = 0;
      const t = THREE.MathUtils.clamp(ap.dot(ab) / lenSq, 0, 1);
      const closest = a.clone().addScaledVector(ab, t);
      if (closest.distanceTo(block.position) < width) return false;
    }
    return true;
  }

  tryUserSteal(isSlide = false) {
    const p = this.player;
    if (isSlide) {
      if (!p.canSlide()) return;
      p.playSlideAnimation();
    } else {
      if (!p.canSteal()) return;
      p.playStealAnimation();
      p.markSteal();
    }

    // Se a bola estiver livre, não precisa apertar nada: é só chegar perto dela.
    // Espaço/F servem para roubar de quem está com a posse.
    if (!this.ball.owner || this.ball.owner.team === p.team) return;
    if (this.ball.ownerLockTimer > 0 && !isSlide) return;

    const carrier = this.ball.owner;
    const dist = p.position.distanceTo(carrier.position);
    const range = (isSlide ? 2.2 : 1.35) + p.control * 0.08;
    if (dist > range) return;

    const dirToCarrier = carrier.position.clone().sub(p.position);
    dirToCarrier.y = 0;
    if (dirToCarrier.lengthSq() === 0) dirToCarrier.copy(p.lastMoveDir);
    dirToCarrier.normalize();

    const facing = THREE.MathUtils.clamp(p.lastMoveDir.clone().normalize().dot(dirToCarrier), -1, 1);
    const baseChance = isSlide ? 0.62 : 0.38;
    const chance = THREE.MathUtils.clamp(baseChance + facing * 0.18 + p.control * 0.06, 0.12, 0.86);

    if (Math.random() < chance) {
      this.ball.setOwner(p, CONFIG.ball.stealLock);
      this.flashText(isSlide ? 'Carrinho perfeito!' : 'Roubou a bola!', 26, 420);
    } else {
      // Quando erra, a bola pode espirrar em vez de ficar presa entre os dois atletas.
      if (Math.random() < (isSlide ? 0.55 : 0.28)) {
        this.ball.pokeLoose(p, dirToCarrier, isSlide ? 8.5 : 5.5);
      }
      this.flashText(isSlide ? 'Carrinho errado!' : 'Disputa perdida!', 22, 360);
    }
  }

  findBestPassTarget(charge = 0) {
    const aimDir = this.getAimDirection();
    let best = null;
    let bestPoint = null;
    let bestScore = -Infinity;
    for (const ally of this.allies) {
      if (ally === this.player || ally.hp <= 0) continue;
      const toAlly = ally.position.clone().sub(this.player.position);
      const distance = toAlly.length();
      if (distance <= 0.01) continue;
      toAlly.normalize();
      const alignment = aimDir.dot(toAlly);
      const pressure = this.getNearestEnemyDistance(ally.position);
      const forward = this.player.team === 'blue' ? this.player.position.z - ally.position.z : ally.position.z - this.player.position.z;
      const roleBonus = ally.role === 'striker' ? 1.8 : ally.role === 'wing' ? 1.3 : ally.role === 'mid' ? 0.8 : 0.2;
      const score = alignment * 3.6 + pressure * 0.18 + forward * 0.08 - distance * 0.032 + roleBonus;
      if (score > bestScore) {
        bestScore = score;
        best = ally;
      }
    }

    if (!best) return null;

    const wantsThrough = charge > 0.58 || this.input.isDown('w');
    if (wantsThrough) {
      const attackSign = this.player.team === 'blue' ? -1 : 1;
      const lead = Math.min(12, 4.5 + charge * 9.0);
      bestPoint = best.position.clone();
      bestPoint.addScaledVector(best.velocity?.clone?.().setY?.(0) || new THREE.Vector3(), 0.18);
      bestPoint.z += attackSign * lead;
      bestPoint.x += Math.sign(best.position.x || this.player.position.x || 1) * Math.min(3.2, charge * 2.4);
      bestPoint.x = THREE.MathUtils.clamp(bestPoint.x, -this.arena.width / 2 + 3, this.arena.width / 2 - 3);
      bestPoint.z = THREE.MathUtils.clamp(bestPoint.z, -this.arena.depth / 2 + 4, this.arena.depth / 2 - 4);
    }

    return { player: best, point: bestPoint };
  }

  getNearestEnemyDistance(pos) {
    let best = Infinity;
    for (const enemy of this.enemies) best = Math.min(best, enemy.position.distanceTo(pos));
    return best;
  }

  resolvePlayerSpacing(players) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const diff = a.position.clone().sub(b.position); diff.y = 0;
        let dist = diff.length();
        const min = a.radius + b.radius;

        if (dist < min) {
          // Quando a distância é praticamente zero, cria uma direção estável.
          // Sem isso, o vetor pode inverter de frame para frame e causar tremedeira.
          if (dist < 0.001) {
            diff.set(Math.sin(i * 12.989 + j * 78.233), 0, Math.cos(i * 37.719 + j * 11.131));
            dist = 0.001;
          }

          diff.normalize();
          const overlap = min - dist;

          const aHasBall = this.ball.owner === a;
          const bHasBall = this.ball.owner === b;

          // O dono da bola recebe menos empurrão. O marcador recua mais.
          // Isso estabiliza a bola presa ao pé do jogador e elimina o efeito tremendo.
          let pushA = 0.5;
          let pushB = 0.5;
          if (aHasBall && !bHasBall) { pushA = 0.22; pushB = 0.78; }
          if (bHasBall && !aHasBall) { pushA = 0.78; pushB = 0.22; }
          if (a.isControlled && !b.isControlled && !bHasBall) { pushA *= 0.8; pushB = 1 - pushA; }
          if (b.isControlled && !a.isControlled && !aHasBall) { pushB *= 0.8; pushA = 1 - pushB; }

          // Se dois companheiros entram embolados perto da área/gol, um abre para rebote/passe
          // em vez de os dois ficarem trombando atrás da bola.
          if (a.team === b.team && !a.isGoalkeeper && !b.isGoalkeeper) {
            const ballNear = this.ball.position.distanceTo(a.position) < 6 || this.ball.position.distanceTo(b.position) < 6;
            const attackingGoal = this.arena.getGoalCenter(a.team);
            const nearGoal = this.ball.position.distanceTo(attackingGoal) < 24;
            if (ballNear && nearGoal) {
              const chosenChaser = a.position.distanceTo(this.ball.position) <= b.position.distanceTo(this.ball.position) ? a : b;
              const support = chosenChaser === a ? b : a;
              const side = Math.sign(support.home?.x || support.position.x || 1);
              const attackSign = support.team === 'blue' ? -1 : 1;
              const desired = new THREE.Vector3(
                THREE.MathUtils.clamp(side * (CONFIG.arena.goalWidth * 0.72 + 4.2), -this.arena.width / 2 + 4, this.arena.width / 2 - 4),
                0,
                THREE.MathUtils.clamp(this.ball.position.z - attackSign * 5.8, -this.arena.depth / 2 + 5, this.arena.depth / 2 - 5)
              );
              support.position.lerp(desired, 0.24);
            }
          }

          a.position.addScaledVector(diff, overlap * pushA);
          b.position.addScaledVector(diff, -overlap * pushB);
          this.arena.clampPosition(a.position, a.radius);
          this.arena.clampPosition(b.position, b.radius);
        }
      }
    }
  }

  checkScores() {
    const scoringTeam = this.arena.checkGoal(this.ball);
    if (!scoringTeam) return;
    if (scoringTeam === 'blue') {
      let points = CONFIG.scoring.goal;
      if (this.modifiers.blueGoldenGoal) { points += 2; this.modifiers.blueGoldenGoal = false; }
      for (const ally of this.allies) ally.addScore(points);
      this.playGoalPresentation(points > 1 ? `GOOOL DE OURO! +${points}` : 'GOOOL DO AZUL! +1', 'blue');
    } else {
      this.enemyScore += 1;
      this.player.takeDamage(12);
      this.playGoalPresentation('Gol adversário!', 'red');
    }
    this.resetKickoff(scoringTeam);
  }

  resetKickoff() {
    this.ball.reset();
    for (const p of [...this.allies, ...this.enemies, ...this.goalkeepers]) {
      p.position.copy(p.home);
      p.syncMesh(0.016);
    }
  }

  getTeamScore() { return this.allies[0]?.score || 0; }

  flashText(text, size = 54, duration = 750) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.top = '45%';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.zIndex = '30';
    el.style.fontSize = `${size}px`;
    el.style.fontWeight = '900';
    el.style.textShadow = '0 10px 40px rgba(0,0,0,.8)';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  playGoalPresentation(text, team = 'blue') {
    this.flashText(text, team === 'blue' ? 66 : 52, 1250);
    const overlay = document.createElement('div');
    overlay.className = `goal-burst ${team}`;
    overlay.innerHTML = `<strong>${text}</strong><span>${team === 'blue' ? 'RogueBall FC' : 'Rivais'}</span>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('show'), 20);
    setTimeout(() => overlay.remove(), 1350);

    const oldFov = this.camera.fov;
    this.camera.fov = Math.max(48, oldFov - 5);
    this.camera.updateProjectionMatrix();
    setTimeout(() => {
      this.camera.fov = oldFov;
      this.camera.updateProjectionMatrix();
    }, 520);
  }

  clearTemporaryRoundModifiers() {
    this.modifiers = this.blankModifiers();
  }

  improveBrains() {
    // Evolução mais perceptível: a IA melhora reação, visão, passe, marcação,
    // posicionamento e finalização a cada rodada, sem ficar instantaneamente impossível.
    const blueGain = 0.070 + Math.min(0.095, this.round * 0.011);
    const redGain = 0.064 + Math.min(0.086, this.round * 0.009);
    for (const k of Object.keys(this.teamBrains.blue)) {
      this.teamBrains.blue[k] = Math.min(2.20, this.teamBrains.blue[k] + blueGain * (0.85 + Math.random() * 0.45));
      this.teamBrains.red[k] = Math.min(2.08, this.teamBrains.red[k] + redGain * (0.85 + Math.random() * 0.5));
    }

    const keeperBlueGain = 0.056 + Math.min(0.078, this.round * 0.008);
    const keeperRedGain = 0.052 + Math.min(0.070, this.round * 0.007);
    for (const k of Object.keys(this.goalieBrains.blue)) {
      this.goalieBrains.blue[k] = Math.min(2.05, this.goalieBrains.blue[k] + keeperBlueGain * (0.85 + Math.random() * 0.45));
      this.goalieBrains.red[k] = Math.min(1.98, this.goalieBrains.red[k] + keeperRedGain * (0.85 + Math.random() * 0.5));
    }
  }

  addBenchRecruit(team) {
    const list = team === 'blue' ? this.allies : this.enemies;
    const nextCount = list.length + 1;
    const max = team === 'blue' ? CONFIG.team.maxBlueCount : CONFIG.team.maxRedCount;
    if (nextCount > max) return null;

    const form = this.getFormation(team, nextCount);
    const pos = form[nextCount - 1] || form[form.length - 1];
    const entry = this.arena.getBenchEntryPosition(team, list.length);
    const isBlue = team === 'blue';
    const player = new AIPlayer(this.scene, {
      team,
      name: pos.name || (isBlue ? 'Reserva Azul' : 'Reserva Rival'),
      number: isBlue ? (11 + list.length * 5) : (12 + list.length * 4),
      role: pos.role || 'mid',
      x: entry.x,
      z: entry.z,
      color: isBlue ? 0x4aa3ff : 0xff3d45,
      speed: isBlue ? CONFIG.ai.speed * 1.00 : CONFIG.ai.speed * 0.99 + this.round * 0.035,
      brain: isBlue ? this.teamBrains.blue : this.teamBrains.red
    });
    player.home.set(pos.x, 0, pos.z);
    player.position.copy(entry);
    player.stuckTimer = 0;
    player.action = 'run';
    player.lastMoveDir.set(1, 0, 0);
    player.facingDir.copy(player.lastMoveDir);
    list.push(player);
    if (isBlue) this.blueCount = list.length; else this.redCount = list.length;
    return player;
  }

  recruitIfNeeded() {
    this.pendingRecruits = { blue: 0, red: 0 };
    let msg = '';
    if (this.allies.length < CONFIG.team.maxBlueCount) {
      this.pendingRecruits.blue = 1;
      msg += `Seu banco chamou +1 jogador para entrar sem reiniciar a jogada. `;
    }
    if (this.enemies.length < CONFIG.team.maxRedCount) {
      this.pendingRecruits.red = 1;
      msg += `Rivais também prepararam +1 reserva.`;
    }
    return msg.trim();
  }

  endRound() {
    this.state = 'upgrade';
    this.clearTemporaryRoundModifiers();
    this.improveBrains();
    const recruitText = this.recruitIfNeeded();
    const upgradeOptions = this.upgrades.getRandomOptions(3);
    const playerCards = this.cards.randomPlayerCards(3);
    const enemyCard = this.cards.randomEnemyCard();

    this.ui.showRoundRewards({
      score: this.getTeamScore(),
      round: this.round,
      blueCount: this.blueCount + (this.pendingRecruits.blue || 0),
      redCount: this.redCount + (this.pendingRecruits.red || 0),
      brains: { ...this.teamBrains, goalkeepers: this.goalieBrains },
      recruitText,
      upgradeOptions,
      playerCards,
      enemyCard,
      onPick: (upgrade, card) => {
        for (const ally of this.allies) upgrade.apply(ally);
        card.apply(this);
        enemyCard.apply(this);
        this.lastPlayerCard = card.title.replace('Carta: ', '');
        this.lastEnemyCard = enemyCard.title.replace('Rival: ', '');
        this.nextRound();
      }
    });
  }

  nextRound() {
    this.round += 1;
    this.difficulty += 0.15;
    this.timeLeft = CONFIG.roundSeconds;

    // A rodada não reinicia mais a posição de todo mundo.
    // Ela apenas pausa no menu de cartas e, ao continuar, mantém bola e jogadores onde estavam.
    if (this.pendingRecruits.blue > 0) {
      const p = this.addBenchRecruit('blue');
      if (p) this.flashText(`${p.name} saiu do banco!`, 26, 900);
    }
    if (this.pendingRecruits.red > 0) this.addBenchRecruit('red');
    this.pendingRecruits = { blue: 0, red: 0 };

    for (const keeper of this.goalkeepers) {
      keeper.hp = keeper.maxHp;
      keeper.energy = keeper.maxEnergy;
      keeper.setBrain(this.goalieBrains[keeper.team]);
      keeper.syncMesh(0.016);
    }

    for (const ally of this.allies) {
      ally.hp = Math.min(ally.maxHp, ally.hp + 24);
      ally.energy = ally.maxEnergy;
      ally.setBrain(this.teamBrains.blue);
      ally.syncMesh(0.016);
    }
    for (const enemy of this.enemies) {
      enemy.hp = enemy.maxHp;
      enemy.energy = enemy.maxEnergy;
      enemy.aiSpeed *= 1.006;
      enemy.setBrain(this.teamBrains.red);
      enemy.syncMesh(0.016);
    }

    this.setControlledPlayer(Math.min(this.controlledIndex, this.allies.length - 1));
    this.state = 'playing';
    this.ui.showPlaying();
    this.updateSwitchPreview();
    this.flashText(`Rodada ${this.round}: jogo despausado!`, 30, 950);
  }

  updateCamera(dt) {
    const mode = this.cameraMode || 'broadcast';
    const ballPos = this.ball?.position || this.player.position;
    let focus = this.player.position.clone();
    let desired;
    let lookAt;

    if (mode === 'firstPerson') {
      const face = this.player.visualFacingDir?.clone?.() || this.player.facingDir?.clone?.() || this.player.lastMoveDir?.clone?.() || new THREE.Vector3(0, 0, -1);
      face.y = 0;
      if (face.lengthSq() < 0.001) face.set(0, 0, this.player.team === 'blue' ? -1 : 1);
      face.normalize();

      // Visão do jogador corrigida: câmera fica na altura dos olhos e um pouco
      // à frente da cabeça. Além disso, o corpo do jogador controlado é ocultado
      // só nessa câmera para não tampar a tela.
      desired = this.player.position.clone()
        .add(new THREE.Vector3(0, 2.55, 0))
        .addScaledVector(face, 1.28);
      lookAt = desired.clone().addScaledVector(face, 12.0);
      lookAt.y = desired.y - 0.18 + Math.max(0, this.ball.position.y * 0.10);
    } else if (mode === 'follow') {
      desired = this.player.position.clone().add(new THREE.Vector3(0, CONFIG.camera.followHeight, CONFIG.camera.followDistance));
      lookAt = this.player.position.clone().add(new THREE.Vector3(0, 1.2, -4.2));
    } else if (mode === 'ball') {
      focus = ballPos.clone().lerp(this.player.position, 0.25);
      desired = focus.clone().add(new THREE.Vector3(0, CONFIG.camera.ballHeight, CONFIG.camera.ballDistance));
      lookAt = ballPos.clone().add(new THREE.Vector3(0, 0.8, 0));
    } else {
      // Câmera estilo transmissão/FIFA: mais alta, pega mais campo e facilita leitura tática.
      focus = this.player.position.clone().lerp(ballPos, 0.55);
      desired = focus.clone().add(new THREE.Vector3(0, CONFIG.camera.broadcastHeight, CONFIG.camera.broadcastDistance));
      lookAt = focus.clone().add(new THREE.Vector3(0, 0.8, -5));
    }

    this.camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(lookAt);
    this.applyFirstPersonVisibility(mode);
  }

  applyFirstPersonVisibility(mode) {
    const shouldHide = mode === 'firstPerson';

    if (this.firstPersonHiddenPlayer && this.firstPersonHiddenPlayer !== this.player) {
      this.firstPersonHiddenPlayer.setProceduralBodyVisible(true);
      this.firstPersonHiddenPlayer = null;
    }

    if (shouldHide && this.player) {
      this.player.setProceduralBodyVisible(false);
      this.firstPersonHiddenPlayer = this.player;
    } else if (!shouldHide && this.firstPersonHiddenPlayer) {
      this.firstPersonHiddenPlayer.setProceduralBodyVisible(true);
      this.firstPersonHiddenPlayer = null;
    }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
