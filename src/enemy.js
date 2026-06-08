class Enemy {
  constructor(x, y, difficulty = 1) {
    this.x = x;
    this.y = y;
    this.radius = CONFIG.enemy.radius;
    this.speed = CONFIG.enemy.speed + difficulty * 8;
    this.damage = CONFIG.enemy.damage + Math.floor(difficulty * 1.2);
    this.damageCooldown = CONFIG.enemy.damageCooldown;
    this.damageTimer = 0;
  }

  update(delta, player, ball, arena) {
    this.damageTimer = Math.max(0, this.damageTimer - delta);

    const target = ball.owner === player ? player : ball;
    const direction = normalize(target.x - this.x, target.y - this.y);

    this.x += direction.x * this.speed * delta;
    this.y += direction.y * this.speed * delta;

    arena.keepInside(this);

    if (circleCollision(this, player) && this.damageTimer <= 0) {
      player.takeDamage(this.damage);
      this.damageTimer = this.damageCooldown;
    }
  }

  draw(ctx) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    ctx.strokeStyle = '#ffe1e1';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('IA', this.x, this.y + 4);

    ctx.restore();
  }
}
