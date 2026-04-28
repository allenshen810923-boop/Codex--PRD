const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const msg = document.getElementById('msg');

const MAP = [
  '###############',
  '#S     #     ##',
  '# ### ### #   #',
  '#   #   # ### #',
  '### # # #   # #',
  '#   # # ### # #',
  '# ### #   # # #',
  '#   # ### # # #',
  '# #   #   #   #',
  '# # ### ### ###',
  '# #     #   #E#',
  '###############'
];

const cell = 1;
const fov = Math.PI / 3;
const maxDepth = 18;
const keys = new Set();

const player = {
  x: 1.5,
  y: 1.5,
  angle: 0,
  speed: 2.3,
  radius: 0.2,
  rotateSpeed: 2.2
};

const game = {
  last: 0,
  timer: 120,
  won: false,
  started: false,
  pointerLocked: false
};

const hazards = [
  { type: 'patrol', x: 6.5, y: 3.5, a: 5.5, b: 9.5, dir: 1, speed: 1.3, r: 0.22 },
  { type: 'patrol', x: 10.5, y: 8.5, a: 7.5, b: 10.5, dir: -1, speed: 1.0, r: 0.22 },
  { type: 'spinner', x: 4.5, y: 8.5, period: 3.3, width: 0.9 },
  { type: 'spinner', x: 11.5, y: 4.5, period: 2.4, width: 0.9 }
];

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}

function getCell(x, y) {
  const row = MAP[Math.floor(y)];
  if (!row) return '#';
  return row[Math.floor(x)] ?? '#';
}

function isWall(x, y) {
  return getCell(x, y) === '#';
}

function isExit(x, y) {
  return getCell(x, y) === 'E';
}

function blockedBySpinner(x, y, spinner, t) {
  const phase = (t / spinner.period) * Math.PI;
  const half = spinner.width / 2;
  const dx = x - spinner.x;
  const dy = y - spinner.y;
  const axisX = Math.cos(phase);
  const axisY = Math.sin(phase);
  const along = dx * axisX + dy * axisY;
  const cross = Math.abs(dx * axisY - dy * axisX);
  return Math.abs(along) < half && cross < 0.09;
}

function pointBlocked(x, y, t = game.last / 1000) {
  if (isWall(x, y)) return true;
  return hazards.some((h) => h.type === 'spinner' && blockedBySpinner(x, y, h, t));
}

function movePlayer(nx, ny) {
  const checks = [
    [nx + player.radius, ny],
    [nx - player.radius, ny],
    [nx, ny + player.radius],
    [nx, ny - player.radius]
  ];
  if (checks.every(([x, y]) => !pointBlocked(x, y))) {
    player.x = nx;
    player.y = ny;
  }
}

function update(dt) {
  if (!game.started || game.won) return;

  game.timer = Math.max(0, game.timer - dt);
  if (game.timer === 0) {
    msg.textContent = '时间到！点击刷新再试一次。';
    game.won = true;
    return;
  }

  const turnLeft = keys.has('ArrowLeft');
  const turnRight = keys.has('ArrowRight');
  if (turnLeft) player.angle -= player.rotateSpeed * dt;
  if (turnRight) player.angle += player.rotateSpeed * dt;

  const fw = (keys.has('w') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0);
  const strafe = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
  const dx = Math.cos(player.angle) * fw + Math.cos(player.angle + Math.PI / 2) * strafe;
  const dy = Math.sin(player.angle) * fw + Math.sin(player.angle + Math.PI / 2) * strafe;

  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    const step = player.speed * dt;
    movePlayer(player.x + (dx / len) * step, player.y + (dy / len) * step);
  }

  const t = game.last / 1000;
  for (const h of hazards) {
    if (h.type === 'patrol') {
      h.x += h.dir * h.speed * dt;
      if (h.x < h.a || h.x > h.b) {
        h.dir *= -1;
        h.x = Math.max(h.a, Math.min(h.b, h.x));
      }
      const d = Math.hypot(player.x - h.x, player.y - h.y);
      if (d < h.r + player.radius + 0.05) {
        const push = 0.55;
        player.x -= Math.cos(player.angle) * push;
        player.y -= Math.sin(player.angle) * push;
        game.timer = Math.max(0, game.timer - 8);
        msg.textContent = '被守卫撞到！剩余时间 -8 秒';
      }
    }

    if (h.type === 'spinner' && blockedBySpinner(player.x, player.y, h, t)) {
      player.x -= Math.cos(player.angle) * 0.1;
      player.y -= Math.sin(player.angle) * 0.1;
    }
  }

  if (isExit(player.x, player.y)) {
    game.won = true;
    msg.textContent = `成功逃出迷宫！剩余 ${game.timer.toFixed(1)} 秒`; 
  } else if (!msg.textContent.includes('撞到')) {
    msg.textContent = `剩余时间：${game.timer.toFixed(1)} 秒`;
  }
}

function castRay(angle, t) {
  let dist = 0;
  while (dist < maxDepth) {
    dist += 0.03;
    const rx = player.x + Math.cos(angle) * dist;
    const ry = player.y + Math.sin(angle) * dist;
    if (pointBlocked(rx, ry, t)) {
      return { dist, hit: pointBlocked(rx, ry, t) ? 'wall' : 'none' };
    }
    if (isExit(rx, ry)) {
      return { dist, hit: 'exit' };
    }
  }
  return { dist: maxDepth, hit: 'none' };
}

function drawWorld() {
  const { width, height } = canvas;
  const t = game.last / 1000;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.52, '#111827');
  gradient.addColorStop(1, '#020617');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x < width; x++) {
    const rayAngle = player.angle - fov / 2 + (x / width) * fov;
    const { dist, hit } = castRay(rayAngle, t);
    const corrected = dist * Math.cos(rayAngle - player.angle);
    const wallH = Math.min(height, (height / corrected) * 0.95);
    const y = (height - wallH) / 2;

    const shade = Math.max(0.15, 1 - corrected / maxDepth);
    if (hit === 'exit') {
      ctx.fillStyle = `rgba(34, 197, 94, ${0.4 + shade * 0.6})`;
    } else {
      ctx.fillStyle = `rgba(148, 163, 184, ${0.24 + shade * 0.76})`;
    }
    ctx.fillRect(x, y, 1, wallH);

    ctx.fillStyle = `rgba(15, 23, 42, ${(1 - shade) * 0.65})`;
    ctx.fillRect(x, y + wallH, 1, height - (y + wallH));
  }

  drawSprites(t);
}

function drawSprites(t) {
  const { width, height } = canvas;

  const sprites = [];
  for (const h of hazards) {
    if (h.type === 'patrol') {
      sprites.push({ x: h.x, y: h.y, color: '#ef4444', size: 0.45 });
    } else {
      const phase = (t / h.period) * Math.PI;
      sprites.push({
        x: h.x + Math.cos(phase) * 0.3,
        y: h.y + Math.sin(phase) * 0.3,
        color: '#22d3ee',
        size: 0.3
      });
    }
  }

  sprites
    .map((s) => {
      const dx = s.x - player.x;
      const dy = s.y - player.y;
      const dist = Math.hypot(dx, dy);
      const angleTo = Math.atan2(dy, dx) - player.angle;
      const normalized = Math.atan2(Math.sin(angleTo), Math.cos(angleTo));
      return { ...s, dist, angle: normalized };
    })
    .filter((s) => Math.abs(s.angle) < fov / 1.6)
    .sort((a, b) => b.dist - a.dist)
    .forEach((s) => {
      const screenX = ((s.angle + fov / 2) / fov) * width;
      const size = Math.max(8, (height / s.dist) * s.size);
      const y = height / 2;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(screenX, y, size, 0, Math.PI * 2);
      ctx.fill();
    });
}

function loop(ts) {
  if (!game.last) game.last = ts;
  const dt = Math.min(0.033, (ts - game.last) / 1000);
  game.last = ts;

  update(dt);
  drawWorld();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (!game.started) {
    game.started = true;
    msg.textContent = '已开始，尽快找到出口！';
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

canvas.addEventListener('click', async () => {
  if (!document.pointerLockElement) {
    await canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  game.pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener('mousemove', (e) => {
  if (game.pointerLocked) {
    player.angle += e.movementX * 0.0026;
  }
});

resize();
requestAnimationFrame(loop);
