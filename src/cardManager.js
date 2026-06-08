export class CardManager {
  constructor() {
    this.playerCards = [
      {
        title: 'Carta: Gol de Ouro',
        desc: 'Durante a próxima rodada, o primeiro gol do seu time vale +2.',
        apply: (game) => { game.modifiers.blueGoldenGoal = true; }
      },
      {
        title: 'Carta: Pressão Total',
        desc: '+18% velocidade e +18% agressividade dos aliados na próxima rodada.',
        apply: (game) => { game.modifiers.bluePress = Math.max(game.modifiers.bluePress, 1); }
      },
      {
        title: 'Carta: Maestro',
        desc: 'Aliados procuram passes melhores e erram menos decisões.',
        apply: (game) => { game.teamBrains.blue.passing += 0.18; game.teamBrains.blue.vision += 0.12; }
      },
      {
        title: 'Carta: Finalização Fria',
        desc: '+22% chute e +15% tomada de decisão perto do gol.',
        apply: (game) => { game.allies.forEach(p => p.kickPower *= 1.22); game.teamBrains.blue.shooting += 0.15; }
      },
      {
        title: 'Carta: Ladrão de Bola',
        desc: 'Seu time rouba mais bolas no contato e marca linhas de passe melhor.',
        apply: (game) => { game.teamBrains.blue.marking += 0.2; game.teamBrains.blue.aggression += 0.12; }
      },
      {
        title: 'Carta: Fôlego de Rua',
        desc: 'Todos os aliados curam e ganham energia máxima.',
        apply: (game) => { game.allies.forEach(p => { p.maxEnergy += 18; p.energy = p.maxEnergy; p.hp = Math.min(p.maxHp, p.hp + 35); }); }
      }
    ];

    this.enemyCards = [
      {
        title: 'Rival: Marcação Alta',
        desc: 'Adversários pressionam mais rápido e tentam roubar a bola cedo.',
        apply: (game) => { game.modifiers.redHighPress = Math.max(game.modifiers.redHighPress, 1); game.teamBrains.red.aggression += 0.16; }
      },
      {
        title: 'Rival: Catimba',
        desc: 'Contato adversário causa mais dano e mais chance de roubo.',
        apply: (game) => { game.modifiers.redTackleBoost = Math.max(game.modifiers.redTackleBoost, 1); }
      },
      {
        title: 'Rival: Contra-Ataque',
        desc: 'Adversários correm melhor quando recuperam a bola.',
        apply: (game) => { game.modifiers.redCounter = Math.max(game.modifiers.redCounter, 1); game.teamBrains.red.positioning += 0.12; }
      },
      {
        title: 'Rival: Camisa 10',
        desc: 'O rival melhora passe e visão na próxima rodada.',
        apply: (game) => { game.teamBrains.red.passing += 0.18; game.teamBrains.red.vision += 0.12; }
      },
      {
        title: 'Rival: Artilheiro',
        desc: 'Finalizações inimigas ficam mais fortes.',
        apply: (game) => { game.enemies.forEach(p => p.kickPower *= 1.2); game.teamBrains.red.shooting += 0.14; }
      }
    ];
  }

  randomPlayerCards(count = 3) {
    return [...this.playerCards].sort(() => Math.random() - 0.5).slice(0, count);
  }

  randomEnemyCard() {
    return this.enemyCards[Math.floor(Math.random() * this.enemyCards.length)];
  }
}
