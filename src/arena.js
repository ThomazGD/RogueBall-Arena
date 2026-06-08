import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { CONFIG } from './config.js';

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.width = CONFIG.arena.width;
    this.depth = CONFIG.arena.depth;
    this.northGoalZ = -this.depth / 2;
    this.southGoalZ = this.depth / 2;
    this.build();
  }

  build() {
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(this.width, 0.18, this.depth),
      new THREE.MeshStandardMaterial({ color: 0x135c32, roughness: 0.82 })
    );
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeafff0 });
    const keeperBlueMat = new THREE.MeshBasicMaterial({ color: 0x79c8ff });
    const keeperRedMat = new THREE.MeshBasicMaterial({ color: 0xffdf79 });

    this.addLine(0, 0.015, 0, this.width, 0.06, lineMat);
    this.addLine(0, 0.016, 0, 0.06, this.depth, lineMat);
    this.addCircle(0, 0.03, 0, 7.2, lineMat);
    this.addSpot(0, 0.045, 0, 0.22, lineMat);
    this.addPenaltySpot('red', lineMat);
    this.addPenaltySpot('blue', lineMat);
    this.addPenaltyBox(-1, lineMat);
    this.addPenaltyBox(1, lineMat);
    this.addKeeperBox('red', keeperRedMat);
    this.addKeeperBox('blue', keeperBlueMat);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x263142, roughness: 0.5 });
    this.addWall(0, CONFIG.arena.wallHeight / 2, -this.depth / 2 - 0.55, this.width, CONFIG.arena.wallHeight, 0.7, wallMat);
    this.addWall(0, CONFIG.arena.wallHeight / 2, this.depth / 2 + 0.55, this.width, CONFIG.arena.wallHeight, 0.7, wallMat);
    this.addWall(-this.width / 2 - 0.35, CONFIG.arena.wallHeight / 2, 0, 0.7, CONFIG.arena.wallHeight, this.depth, wallMat);
    this.addWall(this.width / 2 + 0.35, CONFIG.arena.wallHeight / 2, 0, 0.7, CONFIG.arena.wallHeight, this.depth, wallMat);

    this.addSoccerGoal('north', 0xffd447);
    this.addSoccerGoal('south', 0x4aa3ff);
    this.addTeamBench('blue');
    this.addTeamBench('red');
  }

  addPenaltyBox(side, mat) {
    const z = side < 0 ? -this.depth / 2 + CONFIG.arena.penaltyDepth / 2 : this.depth / 2 - CONFIG.arena.penaltyDepth / 2;
    this.addLine(0, 0.018, z, CONFIG.arena.penaltyWidth, 0.055, mat);
    this.addLine(-CONFIG.arena.penaltyWidth / 2, 0.018, z + side * -CONFIG.arena.penaltyDepth / 2, 0.055, CONFIG.arena.penaltyDepth, mat);
    this.addLine(CONFIG.arena.penaltyWidth / 2, 0.018, z + side * -CONFIG.arena.penaltyDepth / 2, 0.055, CONFIG.arena.penaltyDepth, mat);
  }

  addKeeperBox(team, mat) {
    const area = this.getKeeperArea(team);
    const z = (area.minZ + area.maxZ) / 2;
    const depth = area.maxZ - area.minZ;
    const width = area.maxX - area.minX;
    const goalLineZ = team === 'blue' ? area.maxZ : area.minZ;
    const frontZ = team === 'blue' ? area.minZ : area.maxZ;
    const y = 0.022;

    this.addLine(0, y, frontZ, width, 0.05, mat);
    this.addLine(area.minX, y, z, 0.05, depth, mat);
    this.addLine(area.maxX, y, z, 0.05, depth, mat);
    this.addLine(0, y, goalLineZ, width, 0.035, mat);
  }

  addSoccerGoal(side, color) {
    const z = side === 'north' ? this.northGoalZ + 0.18 : this.southGoalZ - 0.18;
    const dir = side === 'north' ? -1 : 1;
    const goalMat = new THREE.MeshStandardMaterial({ color, emissive: color === 0xffd447 ? 0x332200 : 0x001d44, roughness: 0.4 });
    const netMat = new THREE.MeshStandardMaterial({ color: 0xf2f7ff, transparent: true, opacity: 0.28, roughness: 0.5 });

    this.addGoalPost(-CONFIG.arena.goalWidth / 2, z, goalMat);
    this.addGoalPost(CONFIG.arena.goalWidth / 2, z, goalMat);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.arena.goalWidth, 0.18, 0.18), goalMat);
    cross.position.set(0, CONFIG.arena.goalHeight, z);
    cross.castShadow = true;
    this.scene.add(cross);

    const back = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.arena.goalWidth, CONFIG.arena.goalHeight, 0.08), netMat);
    back.position.set(0, CONFIG.arena.goalHeight / 2, z + dir * CONFIG.arena.goalDepth);
    this.scene.add(back);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.arena.goalWidth, 0.08, CONFIG.arena.goalDepth), netMat);
    roof.position.set(0, CONFIG.arena.goalHeight, z + dir * CONFIG.arena.goalDepth / 2);
    this.scene.add(roof);
  }


  addTeamBench(team) {
    const sign = team === 'blue' ? 1 : -1;
    const mat = new THREE.MeshStandardMaterial({
      color: team === 'blue' ? 0x2458a8 : 0x8e2429,
      roughness: 0.62,
      metalness: 0.08
    });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x101827, roughness: 0.55 });
    const x = -this.width / 2 - 4.7;
    const z = sign * 18;

    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.22, 7.8), mat);
    roof.position.set(x, 1.92, z);
    roof.castShadow = true;
    this.scene.add(roof);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.65, 7.8), mat);
    back.position.set(x - 2.9, 0.86, z);
    back.castShadow = true;
    this.scene.add(back);

    const bench = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.28, 5.8), seatMat);
    bench.position.set(x, 0.38, z);
    bench.castShadow = true;
    this.scene.add(bench);

    const labelMat = new THREE.MeshBasicMaterial({ color: team === 'blue' ? 0x72c6ff : 0xffb5b9 });
    this.addLine(x + 0.05, 0.045, z, 4.9, 0.08, labelMat);
  }

  getBenchEntryPosition(team, slot = 0) {
    const sign = team === 'blue' ? 1 : -1;
    return new THREE.Vector3(-this.width / 2 - 2.4, 0, sign * (18 + slot * 2.2));
  }

  addSpot(x, y, z, radius, mat) {
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.028, 28), mat);
    spot.position.set(x, y, z);
    this.scene.add(spot);
  }

  addPenaltySpot(team, mat) {
    const z = team === 'blue'
      ? this.southGoalZ - CONFIG.arena.penaltyDepth * 0.68
      : this.northGoalZ + CONFIG.arena.penaltyDepth * 0.68;
    this.addSpot(0, 0.045, z, 0.18, mat);
  }

  addLine(x, y, z, w, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
  }

  addCircle(x, y, z, r, mat) {
    const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0);
    const points = curve.getPoints(120).map(p => new THREE.Vector3(p.x + x, y, p.y + z));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geo, mat);
    this.scene.add(line);
  }

  addWall(x, y, z, w, h, d, mat) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
  }

  addGoalPost(x, z, mat) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, CONFIG.arena.goalHeight, 0.22), mat);
    post.position.set(x, CONFIG.arena.goalHeight / 2, z);
    post.castShadow = true;
    this.scene.add(post);
  }

  clampPosition(pos, radius = 0.5) {
    pos.x = THREE.MathUtils.clamp(pos.x, -this.width / 2 + radius, this.width / 2 - radius);
    pos.z = THREE.MathUtils.clamp(pos.z, -this.depth / 2 + radius, this.depth / 2 - radius);
  }

  getKeeperArea(team) {
    const halfW = CONFIG.arena.keeperWidth / 2;
    const d = CONFIG.arena.keeperDepth;
    if (team === 'blue') {
      return {
        minX: -halfW,
        maxX: halfW,
        minZ: this.southGoalZ - d,
        maxZ: this.southGoalZ - 0.22
      };
    }
    return {
      minX: -halfW,
      maxX: halfW,
      minZ: this.northGoalZ + 0.22,
      maxZ: this.northGoalZ + d
    };
  }

  isInKeeperArea(team, pos, buffer = 0) {
    const a = this.getKeeperArea(team);
    return pos.x >= a.minX - buffer && pos.x <= a.maxX + buffer && pos.z >= a.minZ - buffer && pos.z <= a.maxZ + buffer;
  }

  clampKeeperPosition(team, pos, radius = 0.55) {
    const a = this.getKeeperArea(team);
    // O goleiro pode usar profundidade da área, mas não abre fora da boca do gol.
    // Isso evita ficar encostado nas laterais da área antes do 1x1.
    const mouthLimit = CONFIG.arena.goalWidth / 2 - radius - 0.75;
    pos.x = THREE.MathUtils.clamp(pos.x, -mouthLimit, mouthLimit);
    pos.z = THREE.MathUtils.clamp(pos.z, a.minZ + radius, a.maxZ - radius);
  }

  getKeeperHome(team) {
    const a = this.getKeeperArea(team);
    const z = team === 'blue' ? a.maxZ - 1.15 : a.minZ + 1.15;
    return new THREE.Vector3(0, 0, z);
  }

  getOwnGoalCenter(team) {
    return new THREE.Vector3(0, 0, team === 'blue' ? this.southGoalZ : this.northGoalZ);
  }

  checkGoal(ball) {
    const insideWidth = Math.abs(ball.position.x) < CONFIG.arena.goalWidth / 2;
    const lowEnough = ball.position.y < CONFIG.arena.goalHeight;
    if (insideWidth && lowEnough && ball.position.z < this.northGoalZ + 0.6) return 'blue';
    if (insideWidth && lowEnough && ball.position.z > this.southGoalZ - 0.6) return 'red';
    return null;
  }

  getGoalCenter(teamToScore) {
    return new THREE.Vector3(0, 0, teamToScore === 'blue' ? this.northGoalZ : this.southGoalZ);
  }
}
