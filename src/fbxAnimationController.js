import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/FBXLoader.js';

export class FBXAnimationController {
  constructor(parent, options = {}) {
    this.parent = parent;
    this.loader = new FBXLoader();

    this.root = new THREE.Group();
    this.root.name = 'PLAYER_FBX_ROOT';

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this.ready = false;
    this.lockedUntil = 0;

    this.debug = options.debug ?? true;
    this.targetHeight = options.targetHeight ?? 1.85;
    this.rotationY = options.rotationY ?? Math.PI;
    this.forceMaterial = options.forceMaterial ?? false;

    this.files = {
      Character: './assets/models/player_character.fbx',
      Idle: './assets/models/player_idle.fbx',
      Run: './assets/models/player_run.fbx',
      Kick: './assets/models/player_kick.fbx'
    };
  }

  async load() {
    try {
      const character = await this.loadFBX(this.files.Character);

      const info = this.inspectFBX(character);
      console.log('[FBX] player_character.fbx info:', info);

      if (info.meshes === 0 && info.skinnedMeshes === 0) {
        console.warn('[FBX] player_character.fbx não tem corpo visível. Baixe como With Skin.');
        this.ready = false;
        return false;
      }

      this.model = character;
      this.model.name = 'PLAYER_CHARACTER_MODEL';

      this.prepareModel();

      this.root.add(this.model);
      this.parent.add(this.root);

      this.mixer = new THREE.AnimationMixer(this.model);

      // Usa animação interna do próprio character, se existir.
      if (this.model.animations && this.model.animations.length > 0) {
        this.actions.Idle = this.mixer.clipAction(this.model.animations[0]);
        this.actions.Idle.enabled = true;
      }

      // Tenta carregar animações externas, mas se não encaixarem, ignora sem quebrar.
      await this.tryLoadExternalAnimation('Idle', this.files.Idle);
      await this.tryLoadExternalAnimation('Run', this.files.Run);
      await this.tryLoadExternalAnimation('Kick', this.files.Kick, {
        loop: THREE.LoopOnce,
        clampWhenFinished: true
      });

      this.ready = true;

      if (this.actions.Idle) {
        this.playIdle();
      }

      console.log('[FBX] Character carregado e visível:', this.model);

      return true;
    } catch (error) {
      console.warn('[FBX] Erro ao carregar FBX. Mantendo boneco padrão.', error);
      this.ready = false;
      return false;
    }
  }

  loadFBX(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (fbx) => resolve(fbx),
        undefined,
        (error) => reject(error)
      );
    });
  }

  inspectFBX(object) {
    const info = {
      meshes: 0,
      skinnedMeshes: 0,
      bones: 0,
      materials: 0,
      animations: object.animations?.length || 0
    };

    object.traverse((child) => {
      if (child.isMesh) info.meshes++;
      if (child.isSkinnedMesh) info.skinnedMeshes++;
      if (child.isBone) info.bones++;
      if (child.material) info.materials++;
    });

    return info;
  }

  prepareModel() {
    if (!this.model) return;

    this.model.position.set(0, 0, 0);
    this.model.rotation.set(0, this.rotationY, 0);
    this.model.scale.setScalar(1);

    this.model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    const currentHeight = size.y || 1;
    const autoScale = this.targetHeight / currentHeight;

    this.model.scale.setScalar(autoScale);

    this.model.position.x -= center.x * autoScale;
    this.model.position.z -= center.z * autoScale;
    this.model.position.y -= box.min.y * autoScale;

    // Mantém no centro do player. Para testar ao lado, use 1.2.
    this.model.position.x += 0;

    this.model.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.visible = true;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        if (this.forceMaterial) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x00ff66,
            roughness: 0.5,
            metalness: 0.05,
            side: THREE.DoubleSide
          });
          return;
        }

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((mat) => {
              const clone = mat.clone();
              clone.transparent = false;
              clone.opacity = 1;
              clone.side = THREE.DoubleSide;
              clone.needsUpdate = true;
              return clone;
            });
          } else {
            child.material = child.material.clone();
            child.material.transparent = false;
            child.material.opacity = 1;
            child.material.side = THREE.DoubleSide;
            child.material.needsUpdate = true;
          }
        } else {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x2f7cff,
            roughness: 0.55,
            side: THREE.DoubleSide
          });
        }
      }
    });
  }

  getModelBoneMap() {
    const map = new Map();

    if (!this.model) return map;

    this.model.traverse((child) => {
      if (child.isBone) {
        const normalized = this.normalizeBoneName(child.name);

        if (normalized) {
          map.set(normalized, child.name);
        }

        const raw = String(child.name || '').toLowerCase();
        if (raw) {
          map.set(raw, child.name);
        }
      }
    });

    if (this.debug) {
      console.log('[FBX] Ossos encontrados no character:', [...map.keys()].slice(0, 25));
    }

    return map;
  }

  normalizeBoneName(name) {
    let value = String(name || '');

    if (value.includes('|')) {
      value = value.split('|').pop();
    }

    if (value.includes(':')) {
      value = value.split(':').pop();
    }

    value = value
      .replace(/mixamorig/gi, '')
      .replace(/mixamo/gi, '')
      .replace(/armature/gi, '')
      .replace(/[\s_\-:.|]/g, '')
      .toLowerCase();

    return value;
  }

  remapClipToModel(clip) {
    if (!clip || !this.model) return null;

    const boneMap = this.getModelBoneMap();
    const tracks = [];

    for (const track of clip.tracks) {
      const dotIndex = track.name.indexOf('.');
      if (dotIndex === -1) continue;

      const originalBoneName = track.name.slice(0, dotIndex);
      const propertyName = track.name.slice(dotIndex);
      const normalized = this.normalizeBoneName(originalBoneName);
      const targetBoneName = boneMap.get(normalized);

      if (!targetBoneName) {
        continue;
      }

      const TrackType = track.constructor;

      tracks.push(new TrackType(
        `${targetBoneName}${propertyName}`,
        track.times.slice(),
        track.values.slice()
      ));
    }

    if (tracks.length === 0) {
      return null;
    }

    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  async tryLoadExternalAnimation(name, path, options = {}) {
    try {
      const fbx = await this.loadFBX(path);

      if (!fbx?.animations?.length) {
        console.warn(`[FBX] ${name} não tem animação.`);
        return false;
      }

      const clip = fbx.animations[0];
      const remappedClip = this.remapClipToModel(clip);

      if (!remappedClip) {
        console.warn(`[FBX] ${name} não encaixou no esqueleto do character. Ignorando essa animação.`);
        return false;
      }

      const action = this.mixer.clipAction(remappedClip);
      action.enabled = true;

      if (options.loop) {
        action.setLoop(options.loop);
      }

      if (options.clampWhenFinished) {
        action.clampWhenFinished = true;
      }

      this.actions[name] = action;

      console.log(`[FBX] Animação ${name} carregada e remapeada.`);

      return true;
    } catch (error) {
      console.warn(`[FBX] Não foi possível carregar ${name}:`, error);
      return false;
    }
  }

  play(name, fade = 0.15, lockMs = 0) {
    if (!this.ready || !this.actions[name]) return;

    const now = performance.now();

    if (now < this.lockedUntil && name !== 'Kick') {
      return;
    }

    const nextAction = this.actions[name];

    if (this.currentAction === nextAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(fade);
    }

    nextAction.reset();
    nextAction.fadeIn(fade);
    nextAction.play();

    this.currentAction = nextAction;

    if (lockMs > 0) {
      this.lockedUntil = now + lockMs;
    }
  }

  playIdle() {
    this.play('Idle', 0.15);
  }

  playRun() {
    if (this.actions.Run) {
      this.play('Run', 0.12);
    } else {
      this.playIdle();
    }
  }

  playKick() {
    if (this.actions.Kick) {
      this.play('Kick', 0.06, 650);
    } else {
      this.playIdle();
    }
  }

  playPass() {
    this.playIdle();
  }

  playSteal() {
    this.playIdle();
  }

  playSlide() {
    this.playIdle();
  }

  playCall() {
    this.playIdle();
  }

  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  setVisible(visible) {
    if (this.root) {
      this.root.visible = visible;
    }
  }
}