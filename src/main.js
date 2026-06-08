import { Game } from './game.js';

const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas);

document.getElementById('startBtn').addEventListener('click', () => game.start());
document.getElementById('restartBtn').addEventListener('click', () => window.location.reload());
