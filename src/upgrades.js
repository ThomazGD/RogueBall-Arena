class UpgradeManager {
  constructor() {
    this.pool = [
      {
        title: 'Velocidade Explosiva',
        description: '+20% velocidade base e corrida.',
        apply: (player) => {
          player.speed *= 1.2;
          player.sprintSpeed *= 1.2;
        },
      },
      {
        title: 'Chute Canhão',
        description: '+25% poder de chute/arremesso.',
        apply: (player) => {
          player.kickPower *= 1.25;
        },
      },
      {
        title: 'Fôlego de Campeão',
        description: '+30 de vida máxima e cura parcial.',
        apply: (player) => {
          player.maxLife += 30;
          player.life = Math.min(player.maxLife, player.life + 30);
        },
      },
      {
        title: 'Chute Rápido',
        description: '-20% cooldown do chute.',
        apply: (player) => {
          player.kickCooldown = Math.max(0.12, player.kickCooldown * 0.8);
        },
      },
      {
        title: 'Controle de Bola',
        description: '+20% controle de bola ao conduzir.',
        apply: (player) => {
          player.ballControl *= 1.2;
        },
      },
      {
        title: 'Tanque de Energia',
        description: '+15% energia máxima.',
        apply: (player) => {
          player.maxEnergy *= 1.15;
          player.energy = player.maxEnergy;
        },
      },
      {
        title: 'Respiração Atleta',
        description: 'Regeneração de energia melhorada.',
        apply: (player) => {
          player.hasEnergyRegenBonus = true;
        },
      },
    ];
  }

  getRandomOptions(count = 3) {
    const copy = [...this.pool];
    const options = [];

    while (options.length < count && copy.length > 0) {
      const index = Math.floor(Math.random() * copy.length);
      options.push(copy.splice(index, 1)[0]);
    }

    return options;
  }
}
