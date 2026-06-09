export const CONFIG = {
  arena: {
    // Campo maior, com proporção mais próxima de um campo de futebol real.
    // Antes era 58x40, com cara de quadra. Agora fica mais comprido e espaçoso.
    width: 78,
    depth: 92,
    wallHeight: 1.05,
    goalWidth: 14.6,
    goalHeight: 3.2,
    goalDepth: 3.0,
    penaltyWidth: 34,
    penaltyDepth: 15.5,
    keeperWidth: 22,
    keeperDepth: 7.8
  },
  roundSeconds: 120,
  team: {
    startBlueCount: 2,
    startRedCount: 2,
    maxBlueCount: 6,
    maxRedCount: 6,
    recruitEveryRounds: 1
  },
  player: {
    speed: 8.4,
    sprintSpeed: 12.8,
    maxHp: 100,
    maxEnergy: 100,
    energyDrain: 24,
    energyRegen: 18,
    kickPower: 28,
    passPower: 18,
    control: 1,
    shootCooldown: 0.35,
    passCooldown: 0.25,
    radius: 0.55,
    switchCooldown: 0.25,
    callCooldown: 0.65,
    stealCooldown: 0.55,
    slideCooldown: 1.10,
    slideDuration: 0.72,
    slideSpeed: 18.2
  },
  goalkeeper: {
    speed: 7.55,
    radius: 0.62,
    catchDistance: 1.72,
    diveDistance: 4.45,
    catchBallSpeed: 22.5,
    holdTime: 0.34,
    clearPower: 25,
    passPower: 17.5,
    baseBrain: {
      // Goleiro já começa mais esperto e melhora rodada a rodada.
      reflex: 0.92,
      positioning: 0.90,
      handling: 0.82,
      distribution: 0.72,
      bravery: 0.78
    }
  },
  ball: {
    radius: 0.34,
    friction: 0.986,
    stopSpeed: 0.035,
    maxSpeed: 41,
    ownerOffset: 0.88,
    controlDistance: 0.34,
    freePickupSpeed: 4.8,
    possessionLock: 0.58,
    looseAfterKickLock: 0.18,
    stealLock: 0.72
  },
  ai: {
    speed: 7.85,
    enemyDamage: 5,
    hitCooldown: 0.85,
    kickPower: 18,
    passPower: 13,
    dribbleCooldown: 1.15,
    slideCooldown: 1.45,
    decisionCooldown: 0.16,
    pressureDistance: 10.5,
    passDistance: 25,
    shotDistance: 29,
    tackleDistance: 1.38,
    tackleCooldown: 0.62,
    slideChanceBonus: 0.24,
    baseBrain: {
      // Já começa com cara de time treinado, não NPC perdido.
      vision: 0.82,
      reaction: 0.80,
      passing: 0.82,
      marking: 0.80,
      shooting: 0.75,
      aggression: 0.72,
      dribbling: 0.74,
      tackling: 0.72,
      positioning: 0.84
    }
  },
  camera: {
    defaultMode: 'broadcast',
    followHeight: 18,
    followDistance: 21,
    broadcastHeight: 42,
    broadcastDistance: 42,
    ballHeight: 28,
    ballDistance: 30
  },
  scoring: {
    goal: 1,
    xpPerGoal: 45,
    xpToLevel: 100
  }
};
