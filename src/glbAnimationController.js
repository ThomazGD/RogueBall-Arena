import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';

export class GLBAnimationController {
  constructor(parent, options = {}) {
    this.parent = parent;
    this.loader = new GLTFLoader();

    this.root = new THREE.Group();
    this.root.name = 'PLAYER_GLB_ROOT';

    this.model = null;
    this.gltf = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    this.ready = false;
    this.lockedUntil = 0;

    this.debug = options.debug ?? true;
    this.targetHeight = options.targetHeight ?? 1.85;
    this.rotationY = options.rotationY ?? Math.PI;
    this.forceMaterial = options.forceMaterial ?? false;

    this.file = './assets/models/player_character.glb';
  }

  async load() {
    try {
      const gltf = await this.loadGLB(this.file);

      this.gltf = gltf;
      this.model = gltf.scene;
      this.model.name = 'PLAYER_GLB_MODEL';

      const info = this.inspectModel(this.model, gltf.animations);

      console.log('[GLB] player.glb info:', info);
      console.log('[GLB] Animações encontradas:', gltf.animations.map(a => a.name));

      if (info.meshes === 0 && info.skinnedMeshes === 0) {
        console.warn('[GLB] player.glb carregou, mas não tem mesh visível.');
        this.ready = false;
        return false;
      }

      this.prepareModel();

      this.root.add(this.model);
      this.parent.add(this.root);

      this.mixer = new THREE.AnimationMixer(this.model);

      this.setupAnimations(gltf.animations);

      this.ready = true;

      if (this.actions.Idle) {
        this.playIdle();
      } else {
        const firstAction = Object.keys(this.actions)[0];
        if (firstAction) {
          this.play(firstAction);
        }
      }

      console.log('[GLB] Modelo carregado e visível:', this.model);

      return true;
    } catch (error) {
      console.warn('[GLB] Erro ao carregar player.glb. Mantendo boneco padrão.', error);
      this.ready = false;
      return false;
    }
  }

  loadGLB(path) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => resolve(gltf),
        undefined,
        (error) => reject(error)
      );
    });
  }

  inspectModel(model, animations = []) {
    const info = {
      meshes: 0,
      skinnedMeshes: 0,
      bones: 0,
      materials: 0,
      animations: animations.length
    };

    model.traverse((child) => {
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

    this.model.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton) {
        child.skeleton.pose();
      }

      if (child.isMesh || child.isSkinnedMesh) {
        child.visible = true;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;

        if (child.geometry) {
          child.geometry.computeBoundingBox();
          child.geometry.computeBoundingSphere();
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

  setupAnimations(animations = []) {
    if (!this.mixer || animations.length === 0) {
      console.warn('[GLB] Nenhuma animação encontrada dentro do player.glb.');
      return;
    }

    for (const clip of animations) {
      const originalName = clip.name || '';
      const normalizedName = this.normalizeAnimationName(originalName);

      const action = this.mixer.clipAction(clip);
      action.enabled = true;

      this.actions[originalName] = action;

      if (normalizedName) {
        this.actions[normalizedName] = action;
      }

      const lower = originalName.toLowerCase();

      if (!this.actions.Idle && (
        lower.includes('idle') ||
        lower.includes('stand') ||
        lower.includes('breathing') ||
        lower.includes('pose')
      )) {
        this.actions.Idle = action;
      }

      if (!this.actions.Run && (
        lower.includes('run') ||
        lower.includes('running') ||
        lower.includes('jog')
      )) {
        this.actions.Run = action;
      }

      if (!this.actions.Kick && (
        lower.includes('kick') ||
        lower.includes('shoot') ||
        lower.includes('soccer') ||
        lower.includes('football')
      )) {
        this.actions.Kick = action;
      }

      if (!this.actions.Walk && (
        lower.includes('walk') ||
        lower.includes('walking')
      )) {
        this.actions.Walk = action;
      }
    }

    const firstClip = animations[0];
    const firstAction = this.mixer.clipAction(firstClip);

    if (!this.actions.Idle) {
      this.actions.Idle = firstAction;
    }

    if (!this.actions.Run) {
      this.actions.Run = this.actions.Walk || this.actions.Idle;
    }

    if (!this.actions.Kick) {
      this.actions.Kick = this.actions.Idle;
    }

    console.log('[GLB] Actions registradas:', Object.keys(this.actions));
  }

  normalizeAnimationName(name) {
    return String(name || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
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
    if (this.actions.Idle) {
      this.play('Idle', 0.15);
    }
  }

  playRun() {
    if (this.actions.Run) {
      this.play('Run', 0.12);
    } else {
      this.playIdle();
    }
  }

  playKick() {
    if (this.actions.Kick && this.actions.Kick !== this.actions.Idle) {
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