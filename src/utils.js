function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function normalize(x, y) {
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

function circleCollision(a, b) {
  return distance(a, b) < a.radius + b.radius;
}

function randomFromArray(items) {
  return items[Math.floor(Math.random() * items.length)];
}
