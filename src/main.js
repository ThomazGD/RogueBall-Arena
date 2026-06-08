import { Game } from './game.js';

const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas);

const menu = document.getElementById('menu');
const pauseScreen = document.getElementById('pauseScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const resumeBtn = document.getElementById('resumeBtn');
const pauseRestartBtn = document.getElementById('pauseRestartBtn');
const backToMenuBtn = document.getElementById('backToMenuBtn');

const getSettings = () => ({
  cameraMode: document.getElementById('settingCamera')?.value || 'broadcast',
  tacticalStyle: document.getElementById('settingTactic')?.value || 'balanced',
  difficultyPreset: document.getElementById('settingDifficulty')?.value || 'normal',
  roundSeconds: Number(document.getElementById('settingRoundTime')?.value || 120)
});

const setMenuPanel = (name = 'overview') => {
  document.querySelectorAll('[data-menu-panel]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.menuPanel === name);
  });
  document.querySelectorAll('.menu-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${name}`);
  });
};

document.querySelectorAll('[data-menu-panel]').forEach((btn) => {
  btn.addEventListener('click', () => setMenuPanel(btn.dataset.menuPanel));
});

startBtn?.addEventListener('click', () => {
  game.configure(getSettings());
  game.start();
});

restartBtn?.addEventListener('click', () => window.location.reload());
pauseRestartBtn?.addEventListener('click', () => window.location.reload());

resumeBtn?.addEventListener('click', () => {
  pauseScreen?.classList.add('hidden');
  game.resume();
});

backToMenuBtn?.addEventListener('click', () => window.location.reload());

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (game.state === 'playing') {
    game.pause();
    pauseScreen?.classList.remove('hidden');
  } else if (game.state === 'paused') {
    pauseScreen?.classList.add('hidden');
    game.resume();
  }
});

setMenuPanel('overview');
