export class UpgradeManager {
  constructor() {
    this.pool = [
      { title: 'Velocidade de Ponta', desc: '+16% velocidade do time.', apply: p => { p.speed *= 1.16; p.aiSpeed = (p.aiSpeed || p.speed) * 1.12; } },
      { title: 'Chute Canhão', desc: '+25% força de finalização.', apply: p => { p.kickPower *= 1.25; } },
      { title: 'Passe de Maestro', desc: '+28% força dos passes.', apply: p => { p.passPower *= 1.28; } },
      { title: 'Fôlego Infinito', desc: '+25 energia máxima e recupera energia.', apply: p => { p.maxEnergy += 25; p.energy = p.maxEnergy; } },
      { title: 'Corpo Blindado', desc: '+35 vida máxima e cura parcial.', apply: p => { p.maxHp += 35; p.hp = Math.min(p.maxHp, p.hp + 45); } },
      { title: 'Finalização Rápida', desc: '-22% cooldown do chute.', apply: p => { p.shootCooldown *= 0.78; } },
      { title: 'Domínio de Bola', desc: 'Melhora controle e alcance de domínio.', apply: p => { p.control *= 1.25; p.radius += 0.025; } }
    ];
  }

  getRandomOptions(count = 3) {
    return [...this.pool].sort(() => Math.random() - 0.5).slice(0, count);
  }
}
