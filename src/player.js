import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { CONFIG } from './config.js';

export class Player {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.name = options.name || 'Player';
    this.team = options.team || 'blue';
    this.isUser = !!options.isUser;
    this.isControlled = !!options.isControlled;
    this.role = options.role || 'mid';
    this.isGoalkeeper = this.role === 'goalkeeper' || !!options.isGoalkeeper;

    this.home = new THREE.Vector3(options.x || 0, 0, options.z || 0);
    this.position = this.home.clone();
    this.velocity = new THREE.Vector3();
    this.lastMoveDir = new THREE.Vector3(0, 0, this.team === 'blue' ? -1 : 1);
    this.facingDir = this.lastMoveDir.clone();
    this.radius = options.radius || (this.isGoalkeeper ? CONFIG.goalkeeper.radius : CONFIG.player.radius);

    this.speed = options.speed || CONFIG.player.speed;
    this.sprintSpeed = CONFIG.player.sprintSpeed;
    this.maxHp = CONFIG.player.maxHp;
    this.hp = this.maxHp;
    this.maxEnergy = CONFIG.player.maxEnergy;
    this.energy = this.maxEnergy;
    this.kickPower = options.kickPower || CONFIG.player.kickPower;
    this.passPower = options.passPower || CONFIG.player.passPower;
    this.control = CONFIG.player.control;
    this.shootCooldown = CONFIG.player.shootCooldown;
    this.passCooldown = CONFIG.player.passCooldown;
    this.cooldown = 0;
    this.stealCooldown = 0;
    this.slideCooldown = 0;
    this.slideTimer = 0;
    this.xp = 0;
    this.level = 1;
    this.score = 0;
    this.animTime = 0;
    this.actionTimer = 0;
    this.action = 'idle';
    this.isSwitchTarget = false;

    this.dribbleTimer = 0;
    this.dribbleDuration = 0;
    this.dribbleDir = new THREE.Vector3();
    this.dribbleSpeed = 0;
    this.dribbleKind = 'neutral';

    this.uniformColor = options.color || (this.team === 'blue' ? 0x2f7cff : 0xff3d45);
    this.jerseyNumber = options.number || (this.isGoalkeeper ? 1 : Math.floor(7 + Math.random() * 80));
    this.skinColor = options.skinColor || this.pickSkinColor(this.name);
    this.hairColor = options.hairColor || this.pickHairColor(this.name);
    this.bootAccentColor = options.bootAccentColor || (this.team === 'blue' ? 0x6ee7ff : 0xffb4b4);
    this.mesh = this.createHumanoid(this.uniformColor);
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);

    this.setControlled(this.isControlled);
  }

  createHumanoid(color) {
    const group = new THREE.Group();
    group.name = `${this.name}_PROCEDURAL_PLAYER`;

    const isBlue = this.team === 'blue';
    const skinMat = new THREE.MeshStandardMaterial({ color: this.skinColor, roughness: 0.72 });
    const shirtMat = new THREE.MeshStandardMaterial({ color, roughness: 0.48 });
    const shirtDarkMat = new THREE.MeshStandardMaterial({ color: this.darken(color, 0.7), roughness: 0.5 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: this.isGoalkeeper ? 0x111827 : (isBlue ? 0x102a66 : 0x5d1218), roughness: 0.65 });
    const sockMat = new THREE.MeshStandardMaterial({ color: this.isGoalkeeper ? 0xf7f7f7 : (isBlue ? 0xdbeafe : 0xffe1e1), roughness: 0.62 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.68 });
    const hairMat = new THREE.MeshStandardMaterial({ color: this.hairColor, roughness: 0.72 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: this.isGoalkeeper ? 0xffffff : 0xffd2a6, roughness: 0.62 });
    const markerMat = new THREE.MeshStandardMaterial({ color: 0x00ffb7, emissive: 0x005544, roughness: 0.25 });
    const switchMat = new THREE.MeshStandardMaterial({ color: 0xfff35a, emissive: 0x665500, roughness: 0.2 });

    this.parts = {};
    this.limbs = {};

    const hips = new THREE.Group();
    hips.position.y = 0.84;
    group.add(hips);
    this.parts.hips = hips;

    const spine = new THREE.Group();
    spine.position.y = 0.18;
    hips.add(spine);
    this.parts.spine = spine;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.82, 8, 18), shirtMat);
    body.scale.set(1.02, 1, 0.78);
    body.position.y = 0.62;
    body.castShadow = true;
    spine.add(body);
    this.parts.body = body;

    const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.035), shirtDarkMat);
    chestStripe.position.set(0, 0.68, -0.275);
    chestStripe.castShadow = true;
    spine.add(chestStripe);
    this.parts.chestStripe = chestStripe;

    const frontNumber = this.createJerseyNumberPlane(this.jerseyNumber, 0.26, 0.22);
    frontNumber.position.set(0, 0.65, -0.305);
    frontNumber.rotation.x = 0;
    spine.add(frontNumber);
    this.parts.frontNumber = frontNumber;

    const backNumber = this.createJerseyNumberPlane(this.jerseyNumber, 0.32, 0.28);
    backNumber.position.set(0, 0.68, 0.305);
    backNumber.rotation.y = Math.PI;
    spine.add(backNumber);
    this.parts.backNumber = backNumber;

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 8, 22), shirtDarkMat);
    collar.position.set(0, 1.08, -0.02);
    collar.rotation.x = Math.PI / 2;
    spine.add(collar);
    this.parts.collar = collar;

    const headGroup = new THREE.Group();
    headGroup.position.y = 1.28;
    spine.add(headGroup);
    this.parts.headGroup = headGroup;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 16), skinMat);
    neck.position.y = -0.16;
    neck.castShadow = true;
    headGroup.add(neck);
    this.parts.neck = neck;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 18), skinMat);
    head.scale.set(0.9, 1.08, 0.86);
    head.position.y = 0.1;
    head.castShadow = true;
    headGroup.add(head);
    this.parts.head = head;

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.255, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.scale.set(0.98, 0.58, 0.88);
    hair.position.set(0, 0.22, -0.02);
    hair.rotation.x = -0.22;
    hair.castShadow = true;
    headGroup.add(hair);
    this.parts.hair = hair;

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 10), skinMat);
    nose.position.set(0, 0.08, -0.22);
    nose.rotation.x = Math.PI / 2;
    headGroup.add(nose);
    this.parts.nose = nose;

    const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.38), shortsMat);
    shorts.position.y = 0.06;
    shorts.castShadow = true;
    hips.add(shorts);
    this.parts.shorts = shorts;

    this.createLeg('left', hips, -0.19, shortsMat, sockMat, bootMat);
    this.createLeg('right', hips, 0.19, shortsMat, sockMat, bootMat);
    this.createArm('left', spine, -0.42, shirtMat, skinMat, gloveMat);
    this.createArm('right', spine, 0.42, shirtMat, skinMat, gloveMat);

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.45, 18),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 })
    );
    arrow.position.set(0, 2.55, -0.42);
    arrow.rotation.x = -Math.PI / 2;
    group.add(arrow);
    this.parts.arrow = arrow;

    const marker = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.045, 10, 42), markerMat);
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.04;
    group.add(marker);
    this.parts.marker = marker;

    const switchArrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.82, 24), switchMat);
    switchArrow.position.set(0, 3.18, 0);
    switchArrow.rotation.x = Math.PI;
    switchArrow.visible = false;
    group.add(switchArrow);
    this.parts.switchArrow = switchArrow;

    if (this.isGoalkeeper) {
      const aura = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.035, 8, 44),
        new THREE.MeshStandardMaterial({ color: 0xfff35a, emissive: 0x443300, roughness: 0.25 })
      );
      aura.rotation.x = Math.PI / 2;
      aura.position.y = 0.055;
      group.add(aura);
      this.parts.goalkeeperAura = aura;
    }

    const nameTag = this.createNameTag(`${this.jerseyNumber}  ${this.name}`);
    nameTag.position.set(0, 2.88, 0);
    group.add(nameTag);
    this.parts.nameTag = nameTag;

    return group;
  }

  hashString(value) {
    let hash = 0;
    const str = String(value || 'player');
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
    return Math.abs(hash);
  }

  pickSkinColor(seed) {
    const tones = [0xffd2a6, 0xf1b985, 0xd99b6c, 0xb87545, 0x8f5634, 0x6f4229];
    return tones[this.hashString(seed) % tones.length];
  }

  pickHairColor(seed) {
    const colors = [0x15110d, 0x2b1b12, 0x4a2a16, 0x74512d, 0x0f172a, 0x3f3f46];
    return colors[this.hashString(seed + '_hair') % colors.length];
  }

  createJerseyNumberPlane(number, width = 0.28, height = 0.24) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.font = '900 78px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 4;
    ctx.fillText(String(number), 64, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  }

  createNameTag(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(8,12,20,.72)';
    this.roundRect(ctx, 44, 32, 424, 64, 24);
    ctx.fill();
    ctx.strokeStyle = this.team === 'blue' ? 'rgba(100,180,255,.8)' : 'rgba(255,110,110,.8)';
    ctx.lineWidth = 4;
    this.roundRect(ctx, 44, 32, 424, 64, 24);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 34px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.25, 0.32, 1);
    sprite.visible = this.isControlled || this.isUser || this.isGoalkeeper;
    return sprite;
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  darken(color, factor) {
    const c = new THREE.Color(color);
    c.multiplyScalar(factor);
    return c.getHex();
  }

  createLeg(side, parent, x, shortsMat, sockMat, bootMat) {
    const sign = side === 'left' ? -1 : 1;
    const upper = new THREE.Group();
    upper.position.set(x, -0.12, 0);
    parent.add(upper);
    this.limbs[`${side}UpperLeg`] = upper;

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.48, 6, 10), shortsMat);
    thigh.position.y = -0.28;
    thigh.castShadow = true;
    upper.add(thigh);
    this.parts[`${side}Thigh`] = thigh;

    const lower = new THREE.Group();
    lower.position.y = -0.58;
    upper.add(lower);
    this.limbs[`${side}LowerLeg`] = lower;

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.5, 6, 10), sockMat);
    shin.position.y = -0.24;
    shin.castShadow = true;
    lower.add(shin);
    this.parts[`${side}Shin`] = shin;

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.36), bootMat);
    boot.position.set(sign * 0.01, -0.54, -0.08);
    boot.castShadow = true;
    lower.add(boot);
    this.parts[`${side}Boot`] = boot;

    const stud = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.022, 0.22),
      new THREE.MeshStandardMaterial({ color: this.bootAccentColor, roughness: 0.35 })
    );
    stud.position.set(sign * 0.01, -0.61, -0.08);
    lower.add(stud);
    this.parts[`${side}BootAccent`] = stud;
  }

  createArm(side, parent, x, shirtMat, skinMat, gloveMat) {
    const sign = side === 'left' ? -1 : 1;
    const upper = new THREE.Group();
    upper.position.set(x, 0.98, 0);
    upper.rotation.z = sign * 0.2;
    parent.add(upper);
    this.limbs[`${side}UpperArm`] = upper;

    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.26, 6, 10), shirtMat);
    sleeve.position.y = -0.15;
    sleeve.castShadow = true;
    upper.add(sleeve);
    this.parts[`${side}Sleeve`] = sleeve;

    const fore = new THREE.Group();
    fore.position.y = -0.34;
    upper.add(fore);
    this.limbs[`${side}ForeArm`] = fore;

    const armMat = this.isGoalkeeper ? gloveMat : skinMat;
    const foreMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.36, 6, 10), armMat);
    foreMesh.position.y = -0.19;
    foreMesh.castShadow = true;
    fore.add(foreMesh);
    this.parts[`${side}ForearmMesh`] = foreMesh;

    const hand = new THREE.Mesh(new THREE.SphereGeometry(this.isGoalkeeper ? 0.11 : 0.08, 14, 10), gloveMat);
    hand.scale.set(1.12, 0.9, 0.75);
    hand.position.y = -0.42;
    hand.castShadow = true;
    fore.add(hand);
    this.parts[`${side}Hand`] = hand;
  }

  setProceduralBodyVisible(visible) {
    if (!this.parts) return;
    for (const [name, part] of Object.entries(this.parts)) {
      if (['marker', 'arrow', 'switchArrow', 'goalkeeperAura', 'nameTag'].includes(name)) continue;
      part.visible = visible;
    }
  }

  setControlled(active) {
    this.isControlled = active;
    if (this.parts?.marker) this.parts.marker.visible = active;
    if (this.parts?.arrow) this.parts.arrow.visible = active || this.isUser;
    if (this.parts?.nameTag) this.parts.nameTag.visible = active || this.isUser || this.isGoalkeeper;
  }

  setSwitchTarget(active) {
    this.isSwitchTarget = active;
    if (this.parts?.switchArrow) this.parts.switchArrow.visible = active && !this.isControlled;
  }

  updateUser(dt, input, arena) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.stealCooldown = Math.max(0, this.stealCooldown - dt);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.slideTimer = Math.max(0, this.slideTimer - dt);
    this.actionTimer = Math.max(0, this.actionTimer - dt);
    this.dribbleTimer = Math.max(0, this.dribbleTimer - dt);

    const move = input.getMoveVector();
    const wantsSprint = input.isSprinting();
    const sprinting = wantsSprint && this.energy > 0 && move.lengthSq() > 0;
    const sliding = this.slideTimer > 0;
    const currentSpeed = sliding ? CONFIG.player.slideSpeed : (sprinting ? this.sprintSpeed : this.speed);

    this.velocity.set(0, 0, 0);
    if (this.dribbleTimer > 0) {
      // Drible não é mais teleporte: é um arranque curto com animação e controle da bola.
      this.velocity.copy(this.dribbleDir).multiplyScalar(this.dribbleSpeed);
      this.position.addScaledVector(this.velocity, dt);
      this.lastMoveDir.copy(this.dribbleDir);
      this.facingDir.copy(this.dribbleDir);
      this.action = 'dribble';
    } else if (sliding) {
      this.velocity.copy(this.lastMoveDir).multiplyScalar(currentSpeed);
      this.position.addScaledVector(this.velocity, dt);
      this.action = 'slide';
    } else if (move.lengthSq() > 0) {
      this.lastMoveDir.copy(move).normalize();
      // Faz o boneco olhar para onde o WASD está levando ele.
      // Ex.: apertou S, ele vira para baixo/trás; apertou A/D, vira para o lado.
      this.facingDir.copy(this.lastMoveDir);
      this.velocity.copy(move).multiplyScalar(currentSpeed);
      this.position.addScaledVector(this.velocity, dt);
      this.energy -= sprinting ? CONFIG.player.energyDrain * dt : 0;
      this.energy = Math.max(0, this.energy);
      if (this.energy <= 0 && input) input.sprintActive = false;
      this.action = 'run';
    } else if (this.actionTimer <= 0) {
      this.action = 'idle';
      this.energy = Math.min(this.maxEnergy, this.energy + CONFIG.player.energyRegen * dt);
    }

    if (!sprinting) this.energy = Math.min(this.maxEnergy, this.energy + CONFIG.player.energyRegen * dt);
    arena.clampPosition(this.position, this.radius);
    this.syncMesh(dt);
  }

  syncMesh(dt = 0.016) {
    this.mesh.position.copy(this.position);

    let facing = this.lastMoveDir;

    if (this.isGoalkeeper && this.facingDir && this.facingDir.lengthSq() > 0.0001) {
      // Goleiro olha para a bola/campo, não necessariamente para o lado que está correndo.
      facing = this.facingDir;
    } else if (this.velocity.lengthSq() > 0.0001) {
      // Jogador de linha, inclusive o usuário, olha para onde está andando no WASD.
      facing = this.velocity.clone().normalize();
      this.facingDir.copy(facing);
    } else if (this.facingDir && this.facingDir.lengthSq() > 0.0001) {
      facing = this.facingDir;
    }

    if (facing.lengthSq() > 0.0001) {
      // O boneco procedural foi modelado olhando para -Z.
      // Por isso invertemos o vetor na rotação para WASD bater com a direção visual.
      const angle = Math.atan2(-facing.x, -facing.z);
      this.mesh.rotation.y = angle;
    }

    this.animate(dt);
  }

  animate(dt) {
    this.resetProceduralPose();
    this.animTime += dt * 4;
    const speed = this.velocity.length();
    const running = this.action === 'run' && speed > 0.1;
    const sprintingVisual = running && speed > this.speed * 1.12;
    const animRate = sprintingVisual ? 3.75 : (running ? 3.1 : 1);
    const wave = Math.sin(this.animTime * animRate);
    const counter = Math.cos(this.animTime * animRate);
    const bounce = running ? Math.abs(wave) * (sprintingVisual ? 0.08 : 0.055) : Math.sin(this.animTime * 0.65) * 0.015;

    this.mesh.position.y = 0;
    this.parts.hips.position.y = 0.84 + bounce;
    this.parts.spine.rotation.x = running ? -0.08 : Math.sin(this.animTime * 0.55) * 0.018;
    this.parts.spine.rotation.z = running ? counter * 0.035 : 0;
    this.parts.headGroup.rotation.z = running ? counter * 0.035 : Math.sin(this.animTime * 0.4) * 0.025;
    this.parts.headGroup.rotation.x = running ? -0.03 : 0;

    const legSwing = running ? (sprintingVisual ? 1.12 : 0.92) : 0.04;
    const armSwing = running ? (sprintingVisual ? 0.96 : 0.78) : 0.03;
    this.limbs.leftUpperLeg.rotation.x = wave * legSwing;
    this.limbs.rightUpperLeg.rotation.x = -wave * legSwing;
    this.limbs.leftLowerLeg.rotation.x = running ? Math.max(0, -wave) * 0.78 : 0;
    this.limbs.rightLowerLeg.rotation.x = running ? Math.max(0, wave) * 0.78 : 0;
    this.limbs.leftUpperArm.rotation.x = -wave * armSwing;
    this.limbs.rightUpperArm.rotation.x = wave * armSwing;
    this.limbs.leftForeArm.rotation.x = running ? -0.36 + Math.max(0, wave) * 0.42 : -0.08;
    this.limbs.rightForeArm.rotation.x = running ? -0.36 + Math.max(0, -wave) * 0.42 : -0.08;
    this.limbs.leftUpperArm.rotation.z = -0.24;
    this.limbs.rightUpperArm.rotation.z = 0.24;

    if (this.action === 'kick') this.animateKick();
    if (this.action === 'pass') this.animatePass();
    if (this.action === 'call') this.animateCall();
    if (this.action === 'steal') this.animateSteal();
    if (this.action === 'slide') this.animateSlide();
    if (this.action === 'dribble') this.animateDribble();
    if (this.action === 'keeperCatch') this.animateKeeperCatch();
    if (this.action === 'keeperDive') this.animateKeeperDive();

    if (this.parts.switchArrow) {
      this.parts.switchArrow.position.y = 3.15 + Math.sin(this.animTime * 1.8) * 0.16;
      this.parts.switchArrow.rotation.y += dt * 2.8;
    }
    if (this.parts.marker) this.parts.marker.rotation.z += dt * 1.6;
    if (this.parts.arrow) this.parts.arrow.position.y = 2.55 + Math.sin(this.animTime * 2) * 0.06;
    if (this.parts.goalkeeperAura) this.parts.goalkeeperAura.rotation.z += dt * 2.2;
  }


  resetProceduralPose() {
    // Reseta TODAS as rotações que podem ser alteradas por chute, carrinho,
    // defesa do goleiro etc. Sem isso, a última pose ficava “presa”.
    this.mesh.position.y = 0;

    if (this.parts?.hips) this.parts.hips.rotation.set(0, 0, 0);
    if (this.parts?.spine) this.parts.spine.rotation.set(0, 0, 0);
    if (this.parts?.headGroup) this.parts.headGroup.rotation.set(0, 0, 0);

    const limbNames = [
      'leftUpperLeg', 'rightUpperLeg',
      'leftLowerLeg', 'rightLowerLeg',
      'leftUpperArm', 'rightUpperArm',
      'leftForeArm', 'rightForeArm'
    ];

    for (const name of limbNames) {
      if (this.limbs?.[name]) {
        this.limbs[name].rotation.set(0, 0, 0);
      }
    }
  }

  actionProgress(duration) {
    return THREE.MathUtils.clamp(1 - Math.max(0, this.actionTimer / duration), 0, 1);
  }

  animateKick() {
    const p = this.actionProgress(0.34);
    const swing = Math.sin(p * Math.PI);
    this.parts.spine.rotation.x = -0.12 * swing;
    this.parts.spine.rotation.z = -0.10 * swing;
    this.limbs.rightUpperLeg.rotation.x = -1.15 + swing * 2.25;
    this.limbs.rightLowerLeg.rotation.x = 0.32 + swing * 0.72;
    this.limbs.leftUpperLeg.rotation.x = 0.34;
    this.limbs.leftUpperArm.rotation.x = -0.8;
    this.limbs.rightUpperArm.rotation.x = 0.78;
  }

  animatePass() {
    const p = this.actionProgress(0.28);
    const swing = Math.sin(p * Math.PI);
    this.parts.spine.rotation.z = 0.08 * swing;
    this.limbs.rightUpperLeg.rotation.x = -0.45 + swing * 1.1;
    this.limbs.rightLowerLeg.rotation.x = swing * 0.35;
    this.limbs.leftUpperArm.rotation.x = -0.6;
    this.limbs.rightUpperArm.rotation.x = 0.35;
  }

  animateCall() {
    const wave = Math.sin(this.animTime * 5) * 0.18;
    this.limbs.leftUpperArm.rotation.z = -2.05;
    this.limbs.rightUpperArm.rotation.z = 2.05;
    this.limbs.leftUpperArm.rotation.x = -0.3 + wave;
    this.limbs.rightUpperArm.rotation.x = -0.3 + wave;
    this.parts.headGroup.rotation.x = -0.15;
  }

  animateSteal() {
    const p = this.actionProgress(0.28);
    const punch = Math.sin(p * Math.PI);
    this.parts.spine.rotation.x = -0.18 * punch;
    this.limbs.leftUpperArm.rotation.x = -1.05 * punch;
    this.limbs.rightUpperArm.rotation.x = -1.0 * punch;
    this.limbs.leftUpperLeg.rotation.x = 0.5 * punch;
    this.limbs.rightUpperLeg.rotation.x = -0.35 * punch;
  }

  animateSlide() {
    const p = this.actionProgress(CONFIG.player.slideDuration);
    const ease = Math.sin(p * Math.PI);
    const enter = THREE.MathUtils.smoothstep(p, 0, 0.28);
    const recover = 1 - THREE.MathUtils.smoothstep(p, 0.76, 1);
    const hold = Math.min(enter, recover);

    // Carrinho inspirado no jogador de camisa branca: corpo baixo, de lado,
    // uma perna esticada para a bola e a outra dobrada para trás.
    const slideSide = Math.sign(this.lastMoveDir.x || this.facingDir?.x || 1);
    this.mesh.position.y = -0.26 * hold;
    this.parts.hips.position.y = 0.70 - 0.20 * hold;
    this.parts.hips.rotation.x = -0.48 * hold;
    this.parts.hips.rotation.z = -1.02 * slideSide * hold;
    this.parts.spine.rotation.x = -0.22 * hold;
    this.parts.spine.rotation.z = 0.58 * slideSide * hold;
    this.parts.headGroup.rotation.x = 0.14 * hold;
    this.parts.headGroup.rotation.z = -0.28 * slideSide * hold;

    // Perna de bote esticada.
    this.limbs.rightUpperLeg.rotation.x = -1.10 * hold;
    this.limbs.rightUpperLeg.rotation.z = -0.22 * slideSide * hold;
    this.limbs.rightLowerLeg.rotation.x = 0.16 * hold;

    // Perna de apoio dobrada.
    this.limbs.leftUpperLeg.rotation.x = 0.72 * hold;
    this.limbs.leftUpperLeg.rotation.z = 0.52 * slideSide * hold;
    this.limbs.leftLowerLeg.rotation.x = -1.25 * hold;

    // Braços abertos para equilíbrio, como num carrinho real.
    this.limbs.leftUpperArm.rotation.x = -0.18 * hold;
    this.limbs.leftUpperArm.rotation.z = -1.55 * hold;
    this.limbs.leftForeArm.rotation.x = -0.28 * hold;
    this.limbs.rightUpperArm.rotation.x = -0.22 * hold;
    this.limbs.rightUpperArm.rotation.z = 1.28 * hold;
    this.limbs.rightForeArm.rotation.x = -0.18 * hold;

    if (ease < 0.02 && this.actionTimer <= 0.03) {
      this.mesh.position.y = 0;
    }
  }

  animateDribble() {
    const duration = this.dribbleDuration || 0.42;
    const p = this.actionProgress(duration);
    const snap = Math.sin(p * Math.PI);
    const side = this.dribbleKind === 'left' ? -1 : this.dribbleKind === 'right' ? 1 : Math.sign(this.dribbleDir?.x || this.lastMoveDir.x || 1);

    // Inspiração de drible real: finta de corpo, step-over, puxada e corte.
    // O corpo inclina, o pé passa em volta/por cima da bola e depois acelera.
    this.parts.hips.position.y = 0.84 - 0.05 * snap;
    this.parts.spine.rotation.x = -0.10 * snap;
    this.parts.headGroup.rotation.z = -0.16 * side * snap;

    if (this.dribbleKind === 'forward' || this.dribbleKind === 'neutral') {
      // Step-over/body feint: uma perna faz meia-lua e o corpo engana para o lado.
      this.parts.hips.rotation.z = 0.22 * side * snap;
      this.parts.spine.rotation.z = -0.34 * side * snap;
      this.limbs.rightUpperLeg.rotation.x = -0.42 * snap;
      this.limbs.rightUpperLeg.rotation.z = -0.72 * side * snap;
      this.limbs.rightLowerLeg.rotation.x = 0.62 * snap;
      this.limbs.leftUpperLeg.rotation.x = 0.28 * snap;
      this.limbs.leftUpperLeg.rotation.z = 0.26 * side * snap;
      this.limbs.leftUpperArm.rotation.z = -0.82 * snap;
      this.limbs.rightUpperArm.rotation.z = 0.72 * snap;
      this.limbs.leftUpperArm.rotation.x = -0.25 * snap;
      this.limbs.rightUpperArm.rotation.x = -0.35 * snap;
      return;
    }

    if (this.dribbleKind === 'back') {
      // Puxada para trás: tronco recua, perna dominante puxa a bola e sai de costas/lado.
      this.parts.hips.rotation.x = 0.22 * snap;
      this.parts.spine.rotation.x = 0.18 * snap;
      this.parts.spine.rotation.z = 0.22 * side * snap;
      this.limbs.rightUpperLeg.rotation.x = 0.78 * snap;
      this.limbs.rightLowerLeg.rotation.x = -0.96 * snap;
      this.limbs.leftUpperLeg.rotation.x = -0.18 * snap;
      this.limbs.leftUpperArm.rotation.z = -0.92 * snap;
      this.limbs.rightUpperArm.rotation.z = 0.92 * snap;
      return;
    }

    // Corte lateral A/D: pé de fora empurra a bola e o corpo explode para o lado.
    this.parts.hips.rotation.z = 0.34 * side * snap;
    this.parts.spine.rotation.z = -0.42 * side * snap;
    this.limbs.rightUpperLeg.rotation.x = -0.18 * snap;
    this.limbs.rightUpperLeg.rotation.z = -0.92 * side * snap;
    this.limbs.rightLowerLeg.rotation.x = 0.42 * snap;
    this.limbs.leftUpperLeg.rotation.x = 0.18 * snap;
    this.limbs.leftUpperLeg.rotation.z = 0.48 * side * snap;
    this.limbs.leftUpperArm.rotation.z = -1.05 * snap;
    this.limbs.rightUpperArm.rotation.z = 1.05 * snap;
  }

  animateKeeperCatch() {
    const p = this.actionProgress(0.38);
    const reach = Math.sin(p * Math.PI);
    this.parts.spine.rotation.x = -0.2 * reach;
    this.limbs.leftUpperArm.rotation.x = -1.35 * reach;
    this.limbs.rightUpperArm.rotation.x = -1.35 * reach;
    this.limbs.leftUpperArm.rotation.z = -0.95;
    this.limbs.rightUpperArm.rotation.z = 0.95;
    this.limbs.leftForeArm.rotation.x = -0.65;
    this.limbs.rightForeArm.rotation.x = -0.65;
  }

  animateKeeperDive() {
    const p = this.actionProgress(0.48);
    const ease = Math.sin(p * Math.PI);
    this.mesh.position.y = -0.12 * ease;
    this.parts.hips.rotation.z = 0.78 * Math.sign(this.lastMoveDir.x || 1);
    this.parts.spine.rotation.z = 0.38 * Math.sign(this.lastMoveDir.x || 1);
    this.limbs.leftUpperArm.rotation.x = -1.3;
    this.limbs.rightUpperArm.rotation.x = -1.3;
    this.limbs.leftUpperLeg.rotation.x = 0.62;
    this.limbs.rightUpperLeg.rotation.x = -0.42;
  }

  playKickAnimation() { this.action = 'kick'; this.actionTimer = 0.34; }
  playPassAnimation() { this.action = 'pass'; this.actionTimer = 0.28; }
  playCallAnimation() { this.action = 'call'; this.actionTimer = 0.55; }
  playStealAnimation() { this.action = 'steal'; this.actionTimer = 0.28; }
  playSlideAnimation() { this.action = 'slide'; this.actionTimer = CONFIG.player.slideDuration; this.slideTimer = CONFIG.player.slideDuration; this.slideCooldown = CONFIG.player.slideCooldown; }
  startDribble(kind = 'neutral', direction = null, distance = 2.8, duration = 0.42) {
    const dir = direction?.clone?.() || this.lastMoveDir.clone();
    dir.y = 0;
    if (dir.lengthSq() === 0) dir.set(0, 0, this.team === 'blue' ? -1 : 1);
    dir.normalize();
    this.dribbleKind = kind;
    this.dribbleDir.copy(dir);
    this.dribbleDuration = duration;
    this.dribbleTimer = duration;
    this.dribbleSpeed = distance / Math.max(0.08, duration);
    this.action = 'dribble';
    this.actionTimer = duration;
  }

  playDribbleAnimation(kind = 'neutral') {
    this.dribbleKind = kind;
    this.action = 'dribble';
    this.actionTimer = this.dribbleDuration || 0.42;
  }
  playKeeperCatchAnimation() { this.action = 'keeperCatch'; this.actionTimer = 0.38; }
  playKeeperDiveAnimation() { this.action = 'keeperDive'; this.actionTimer = 0.48; }

  canSteal() { return this.stealCooldown <= 0; }
  markSteal(multiplier = 1) { this.stealCooldown = CONFIG.player.stealCooldown * multiplier; }
  canSlide() { return this.slideCooldown <= 0; }
  canShoot() { return this.cooldown <= 0; }
  markShot(multiplier = 1) { this.cooldown = this.shootCooldown * multiplier; }

  addScore(points) {
    this.score += points;
    this.xp += points * CONFIG.scoring.xpPerGoal;
    while (this.xp >= CONFIG.scoring.xpToLevel * this.level) {
      this.xp -= CONFIG.scoring.xpToLevel * this.level;
      this.level += 1;
      this.maxHp += 8;
      this.hp = Math.min(this.maxHp, this.hp + 18);
      this.maxEnergy += 4;
      this.kickPower += 0.9;
    }
  }

  takeDamage(amount) { this.hp = Math.max(0, this.hp - amount); }
}
