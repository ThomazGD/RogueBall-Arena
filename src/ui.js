export class UI {
  constructor() {
    this.menu = document.getElementById('menu');
    this.hud = document.getElementById('hud');
    this.help = document.getElementById('help');
    this.upgradeScreen = document.getElementById('upgradeScreen');
    this.gameover = document.getElementById('gameover');
    this.upgradeOptions = document.getElementById('upgradeOptions');
    this.cardOptions = document.getElementById('cardOptions');
    this.enemyCardBox = document.getElementById('enemyCardBox');
    this.roundSummary = document.getElementById('roundSummary');
    this.finalScore = document.getElementById('finalScore');
    this.matchOverlay = document.getElementById('matchOverlay');
    this.scoreboardScore = document.getElementById('scoreboardScore');
    this.tacticalLine = document.getElementById('tacticalLine');
    this.minimapWrap = document.getElementById('minimapWrap');
    this.miniMap = document.getElementById('miniMap');
    this.miniCtx = this.miniMap ? this.miniMap.getContext('2d') : null;
    this.tacticalControls = document.getElementById('tacticalControls');
  }

  showPlaying() {
    this.menu.classList.add('hidden');
    this.upgradeScreen.classList.add('hidden');
    this.gameover.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.help.classList.remove('hidden');
    if (this.matchOverlay) this.matchOverlay.classList.remove('hidden');
    if (this.minimapWrap) this.minimapWrap.classList.remove('hidden');
    if (this.tacticalControls) this.tacticalControls.classList.remove('hidden');
  }

  updateHUD(player, round, timeLeft, ballOwner = null, blueCount = 2, redCount = 2, brains = null, playerCard = null, enemyCard = null, goalieBrains = null, enemyScore = 0) {
    document.getElementById('hudScore').textContent = player.score;
    document.getElementById('hudHp').textContent = Math.ceil(player.hp);
    document.getElementById('hudEnergy').textContent = Math.ceil(player.energy);
    const energyBar = document.getElementById('hudEnergyBar');
    if (energyBar) {
      const pct = Math.max(0, Math.min(100, (player.energy / player.maxEnergy) * 100));
      energyBar.style.width = `${pct}%`;
      energyBar.style.background = pct < 25 ? 'linear-gradient(90deg, #ff4d4d, #ff9f43)' : 'linear-gradient(90deg, #21e6a8, #ffd447)';
    }
    document.getElementById('hudXp').textContent = Math.ceil(player.xp);
    document.getElementById('hudLevel').textContent = player.level;
    document.getElementById('hudRound').textContent = round;
    document.getElementById('hudTime').textContent = Math.ceil(timeLeft);
    document.getElementById('hudPlayer').textContent = player.name || 'Jogador';
    document.getElementById('hudBall').textContent = ballOwner ? (ballOwner.team === 'blue' ? 'Seu time' : 'Rival') : 'Solta';
    const matchup = document.getElementById('hudMatchup');
    if (matchup) matchup.textContent = `${blueCount}x${redCount}`;
    const intel = document.getElementById('hudIntel');
    if (intel && brains) {
      const b = Math.round(((brains.blue.vision + brains.blue.passing + brains.blue.marking + brains.blue.positioning) / 4) * 100);
      const r = Math.round(((brains.red.vision + brains.red.passing + brains.red.marking + brains.red.positioning) / 4) * 100);
      if (goalieBrains) {
        const gb = Math.round(((goalieBrains.blue.reflex + goalieBrains.blue.positioning + goalieBrains.blue.handling + goalieBrains.blue.distribution) / 4) * 100);
        const gr = Math.round(((goalieBrains.red.reflex + goalieBrains.red.positioning + goalieBrains.red.handling + goalieBrains.red.distribution) / 4) * 100);
        intel.textContent = `${b}/${r} | G ${gb}/${gr}`;
      } else {
        intel.textContent = `${b}/${r}`;
      }
    }
    const cards = document.getElementById('hudCards');
    if (cards) cards.textContent = playerCard || enemyCard ? `${playerCard || '-'} / ${enemyCard || '-'}` : '-';

    if (this.scoreboardScore) {
      this.scoreboardScore.textContent = `${player.score || 0} - ${enemyScore || 0}`;
    }
  }

  updateTacticalLine({ cameraMode = 'broadcast', blueBrain = null, redBrain = null, goalieBrains = null, ballOwner = null, tacticalStyle = 'balanced' } = {}) {
    if (!this.tacticalLine) return;
    const camNames = { follow: 'Jogador', broadcast: 'FIFA', ball: 'Bola', firstPerson: '1ª pessoa' };
    const avg = (b) => b ? Math.round(((b.vision + b.passing + b.marking + b.positioning) / 4) * 100) : 0;
    const keeperAvg = (b) => b ? Math.round(((b.reflex + b.positioning + b.handling + b.distribution) / 4) * 100) : 0;
    const owner = ballOwner ? (ballOwner.team === 'blue' ? 'Posse Azul' : 'Posse Rival') : 'Bola solta';
    const styleNames = { balanced: 'Equilibrado', aggressive: 'Agressivo', defensive: 'Defensivo', passing: 'Toque' };
    this.tacticalLine.textContent = `${owner} • Estilo ${styleNames[tacticalStyle] || tacticalStyle} • IA ${avg(blueBrain)}/${avg(redBrain)} • G ${keeperAvg(goalieBrains?.blue)}/${keeperAvg(goalieBrains?.red)} • Câmera ${camNames[cameraMode] || cameraMode}`;
  }

  drawMiniMap({ arena, ball, allies = [], enemies = [], goalkeepers = [], controlled = null } = {}) {
    if (!this.miniCtx || !arena) return;
    const ctx = this.miniCtx;
    const w = this.miniMap.width;
    const h = this.miniMap.height;
    ctx.clearRect(0, 0, w, h);

    const margin = 12;
    const fieldW = w - margin * 2;
    const fieldH = h - margin * 2;
    const sx = fieldW / arena.width;
    const sz = fieldH / arena.depth;
    const mapX = (x) => margin + (x + arena.width / 2) * sx;
    const mapY = (z) => margin + (z + arena.depth / 2) * sz;

    ctx.fillStyle = 'rgba(19, 104, 61, .95)';
    ctx.fillRect(margin, margin, fieldW, fieldH);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, margin, fieldW, fieldH);
    ctx.beginPath();
    ctx.moveTo(margin, margin + fieldH / 2);
    ctx.lineTo(margin + fieldW, margin + fieldH / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(margin + fieldW / 2, margin + fieldH / 2, 22, 0, Math.PI * 2);
    ctx.stroke();

    const drawDot = (p, color, r = 4, ring = false) => {
      if (!p || !p.position) return;
      const x = mapX(p.position.x);
      const y = mapY(p.position.z);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (ring) {
        ctx.strokeStyle = '#fff35a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    for (const p of allies) drawDot(p, '#39a7ff', p === controlled ? 6 : 4, p === controlled);
    for (const p of enemies) drawDot(p, '#ff4f59', 4);
    for (const g of goalkeepers) drawDot(g, g.team === 'blue' ? '#00e5ff' : '#ffbf2e', 5);
    if (ball?.position) drawDot(ball, '#ffffff', 3);
  }

  showRoundRewards(data) {
    const { score, round, blueCount, redCount, brains, recruitText, upgradeOptions, playerCards, enemyCard, onPick } = data;
    this.hud.classList.add('hidden');
    this.help.classList.add('hidden');
    this.upgradeScreen.classList.remove('hidden');
    if (this.matchOverlay) this.matchOverlay.classList.add('hidden');
    if (this.minimapWrap) this.minimapWrap.classList.add('hidden');
    if (this.tacticalControls) this.tacticalControls.classList.add('hidden');

    const blueIntel = Math.round(((brains.blue.vision + brains.blue.passing + brains.blue.marking + brains.blue.positioning) / 4) * 100);
    const redIntel = Math.round(((brains.red.vision + brains.red.passing + brains.red.marking + brains.red.positioning) / 4) * 100);
    const blueKeeperIntel = brains.goalkeepers ? Math.round(((brains.goalkeepers.blue.reflex + brains.goalkeepers.blue.positioning + brains.goalkeepers.blue.handling + brains.goalkeepers.blue.distribution) / 4) * 100) : null;
    const redKeeperIntel = brains.goalkeepers ? Math.round(((brains.goalkeepers.red.reflex + brains.goalkeepers.red.positioning + brains.goalkeepers.red.handling + brains.goalkeepers.red.distribution) / 4) * 100) : null;
    this.roundSummary.innerHTML = `
      <b>Partida pausada no fim da rodada ${round}.</b><br>
      Gols do time: ${score}. Ao continuar, a bola e os jogadores ficam no mesmo lugar. Formato após reservas: <b>${blueCount}x${redCount} + goleiros</b>.<br>
      Inteligência evoluiu: Linha Aliados <b>${blueIntel}</b> / Rivais <b>${redIntel}</b>.<br>
      ${brains.goalkeepers ? `Goleiros evoluíram: Azul <b>${blueKeeperIntel}</b> / Rival <b>${redKeeperIntel}</b>.<br>` : ''}
      ${recruitText ? `<span>${recruitText}</span>` : ''}
    `;

    this.upgradeOptions.innerHTML = '';
    this.cardOptions.innerHTML = '';
    this.enemyCardBox.innerHTML = `<h3>${enemyCard.title}</h3><p>${enemyCard.desc}</p><small>Essa carta será aplicada ao rival automaticamente.</small>`;

    let selectedUpgrade = upgradeOptions[0];
    let selectedCard = playerCards[0];

    const renderSelection = () => {
      [...this.upgradeOptions.children].forEach((el, i) => el.classList.toggle('selected', upgradeOptions[i] === selectedUpgrade));
      [...this.cardOptions.children].forEach((el, i) => el.classList.toggle('selected', playerCards[i] === selectedCard));
    };

    upgradeOptions.forEach((upg) => {
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      card.innerHTML = `<h3>${upg.title}</h3><p>${upg.desc}</p>`;
      card.addEventListener('click', () => { selectedUpgrade = upg; renderSelection(); });
      this.upgradeOptions.appendChild(card);
    });

    playerCards.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'upgrade-card card-pick';
      card.innerHTML = `<h3>${c.title}</h3><p>${c.desc}</p>`;
      card.addEventListener('click', () => { selectedCard = c; renderSelection(); });
      this.cardOptions.appendChild(card);
    });

    const start = document.getElementById('continueRoundBtn');
    start.onclick = () => onPick(selectedUpgrade, selectedCard);
    renderSelection();
  }

  showGameOver(score, round) {
    this.hud.classList.add('hidden');
    this.help.classList.add('hidden');
    this.upgradeScreen.classList.add('hidden');
    this.gameover.classList.remove('hidden');
    if (this.matchOverlay) this.matchOverlay.classList.add('hidden');
    if (this.minimapWrap) this.minimapWrap.classList.add('hidden');
    if (this.tacticalControls) this.tacticalControls.classList.add('hidden');
    this.finalScore.textContent = `Gols finais: ${score} | Rodada alcançada: ${round}`;
  }
}
