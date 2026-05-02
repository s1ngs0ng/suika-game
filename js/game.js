const {
  Engine, Render, Runner, MouseConstraint, Mouse,
  Composite, Bodies, Events,
} = Matter;

// ─── 이미지 교체 시 이 배열만 수정하면 됩니다 ───────────────────────────
const FRUIT_CONFIG = [
  { radius: 20,  scoreValue: 1,  img: './assets/img/circle0.png',  spriteHalf: 276 }, // 0: 체리
  { radius: 24,  scoreValue: 3,  img: './assets/img/circle1.png',  spriteHalf: 340 }, // 1: 딸기
  { radius: 32,  scoreValue: 6,  img: './assets/img/circle2.png',  spriteHalf: 328 }, // 2: 포도
  { radius: 45,  scoreValue: 10, img: './assets/img/circle3.png',  spriteHalf: 372 }, // 3: 레몬
  { radius: 55,  scoreValue: 15, img: './assets/img/circle4.png',  spriteHalf: 509 }, // 4: 귤
  { radius: 68,  scoreValue: 21, img: './assets/img/circle5.png',  spriteHalf: 393, ringSize: 50 }, // 5: 사과
  { radius: 84,  scoreValue: 28, img: './assets/img/circle6.png',  spriteHalf: 409, ringSize: 53 }, // 6: 배
  { radius: 103, scoreValue: 36, img: './assets/img/circle7.png',  spriteHalf: 434 }, // 7: 복숭아
  { radius: 114, scoreValue: 45, img: './assets/img/circle8.png',  spriteHalf: 408 }, // 8: 파인애플
  { radius: 127, scoreValue: 55, img: './assets/img/circle9.png',  spriteHalf: 511 }, // 9: 멜론
  { radius: 156, scoreValue: 66, img: './assets/img/circle10.png', spriteHalf: 388 }, // 10: 수박
];
// ─────────────────────────────────────────────────────────────────────────────

const WALL_PAD       = 64;
const LOSE_Y         = 84;
const STATUS_H       = 48;
const PREVIEW_Y      = 32;
const DROP_COOLDOWN  = 500;
const SPAWN_MAX_IDX  = 4; // 처음 등장할 수 있는 과일 최대 인덱스

const FRICTION = {
  friction:       0.006,
  frictionStatic: 0.006,
  frictionAir:    0,
  restitution:    0.1,
};

const State = { MENU: 0, READY: 1, DROP: 2, LOSE: 3 };

function seededRand(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seededRand(Date.now());

// ─── DOM 참조 ────────────────────────────────────────────────────────────────
const el = {
  canvas:         document.getElementById('game-canvas'),
  ui:             document.getElementById('game-ui'),
  score:          document.getElementById('game-score'),
  highscore:      document.getElementById('game-highscore-value'),
  nextFruitImg:   document.getElementById('game-next-fruit'),
  endContainer:   document.getElementById('game-end-container'),
  endTitle:       document.getElementById('game-end-title'),
  endScore:       document.getElementById('game-end-score'),
  introScreen:    document.getElementById('intro-screen'),
  introFruits:    document.getElementById('intro-fruits'),
  introStartBtn:  document.getElementById('intro-start-btn'),
};

// ─── Matter.js 초기화 ─────────────────────────────────────────────────────
const engine = Engine.create();
const runner = Runner.create();
const render = Render.create({
  element: el.canvas,
  engine,
  options: {
    width:      640,
    height:     960,
    wireframes: false,
    background: 'rgba(3, 7, 16, 0.9)',
  },
});

const mouse           = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
  mouse,
  constraint: { stiffness: 0.2, render: { visible: false } },
  collisionFilter: { mask: 0x0000 }, // 바디 드래그 차단
});
render.mouse = mouse;
Composite.add(engine.world, mouseConstraint);

// ─── 게임 상태 ───────────────────────────────────────────────────────────────
const game = {
  state:        State.MENU,
  score:        0,
  mergeCount:   new Array(FRUIT_CONFIG.length).fill(0),
  currentIdx:   0,
  nextIdx:      0,
  previewBody:  null,
  highscore:    0,
};

// ─── 점수 계산 ───────────────────────────────────────────────────────────────
function calcScore() {
  game.score = game.mergeCount.reduce(
    (total, count, i) => total + FRUIT_CONFIG[i].scoreValue * count,
    0
  );
  el.score.textContent = game.score;
}

// ─── 로컬스토리지 ────────────────────────────────────────────────────────────
function loadHighscore() {
  const saved = localStorage.getItem('suika-highscore');
  game.highscore = saved ? parseInt(saved, 10) : 0;
  el.highscore.textContent = game.highscore;
}

function saveHighscore() {
  calcScore();
  if (game.score <= game.highscore) return;
  game.highscore = game.score;
  el.highscore.textContent = game.highscore;
  el.endTitle.textContent = '최고 기록 갱신!';
  localStorage.setItem('suika-highscore', game.highscore);
}

// ─── 과일 바디 생성 ──────────────────────────────────────────────────────────
function makeFruitBody(x, y, sizeIdx, extra = {}) {
  const { radius, img, spriteHalf } = FRUIT_CONFIG[sizeIdx];
  const scale = radius / spriteHalf;
  const body = Bodies.circle(x, y, radius, {
    ...FRICTION,
    ...extra,
    render: { sprite: { texture: img, xScale: scale, yScale: scale } },
  });
  body.sizeIndex = sizeIdx;
  body.popped    = false;
  body.droppedAt = Date.now();
  return body;
}

// ─── 합체 이펙트 ─────────────────────────────────────────────────────────────
function spawnPop(x, y, radius) {
  const circle = Bodies.circle(x, y, radius, {
    isStatic: true,
    collisionFilter: { mask: 0x0040 },
    angle: rand() * Math.PI * 2,
    render: {
      sprite: {
        texture: './assets/img/pop.png',
        xScale: radius / 384,
        yScale: radius / 384,
      },
    },
  });
  Composite.add(engine.world, circle);
  setTimeout(() => Composite.remove(engine.world, circle), 100);
}

// ─── 사운드 ──────────────────────────────────────────────────────────────────
const sounds = {
  click: new Audio('./assets/sounds/click.mp3'),
  pop:   FRUIT_CONFIG.map((_, i) => new Audio(`./assets/sounds/pop${i}.mp3`)),
};

function playClick() {
  sounds.click.currentTime = 0;
  sounds.click.play().catch(() => {});
}

function playPop(idx) {
  const s = sounds.pop[idx];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => {});
}

// ─── 진화의 고리 ─────────────────────────────────────────────────────────────
function buildEvolutionRing() {
  const ring = document.getElementById('evolution-ring');
  const total = FRUIT_CONFIG.length;
  const R = 140;

  const minR = Math.min(...FRUIT_CONFIG.map(f => f.radius));
  const maxR = Math.max(...FRUIT_CONFIG.map(f => f.radius));

  FRUIT_CONFIG.forEach((fruit, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    const x = R * Math.cos(angle);
    const y = R * Math.sin(angle);
    const size = fruit.ringSize ?? Math.round(28 + (fruit.radius - minR) / (maxR - minR) * 44);

    const img = document.createElement('img');
    img.src = fruit.img;
    img.style.cssText = `position:absolute;width:${size}px;height:${size}px;` +
      `left:calc(50% + ${x}px - ${size / 2}px);` +
      `top:calc(50% + ${y}px - ${size / 2}px);` +
      `object-fit:contain;image-rendering:pixelated;` +
      `filter:drop-shadow(0 2px 6px rgba(0,0,0,0.9));`;
    ring.appendChild(img);
  });
}

// ─── 인트로 과일 원형 배치 ────────────────────────────────────────────────────
function buildIntroFruits() {
  const total  = FRUIT_CONFIG.length;
  const radius = 210;
  el.introFruits.innerHTML = '';

  FRUIT_CONFIG.forEach((fruit, i) => {
    const angle = (2 * Math.PI * i) / total;
    const x     = radius * Math.cos(angle);
    const y     = radius * Math.sin(angle);
    const li    = document.createElement('li');
    li.style.backgroundImage = `url(${fruit.img})`;
    li.style.top             = `calc(50% + ${y}px - 24px)`;
    li.style.left            = `calc(50% + ${x}px - 24px)`;
    el.introFruits.appendChild(li);
  });
}

// ─── 게임 벽 ─────────────────────────────────────────────────────────────────
const wallStyle = { isStatic: true, render: { fillStyle: '#293b49' }, ...FRICTION };
const gameBodies = [
  Bodies.rectangle(-(WALL_PAD / 2),       480,                     WALL_PAD, 960, wallStyle), // 좌벽
  Bodies.rectangle(640 + (WALL_PAD / 2),  480,                     WALL_PAD, 960, wallStyle), // 우벽
  Bodies.rectangle(320,                   960 + (WALL_PAD / 2) - STATUS_H, 640, WALL_PAD, wallStyle), // 바닥
];

// ─── 다음 과일 설정 ──────────────────────────────────────────────────────────
function pickNextFruit() {
  game.nextIdx = Math.floor(rand() * (SPAWN_MAX_IDX + 1));
  el.nextFruitImg.src = FRUIT_CONFIG[game.nextIdx].img;
}

// ─── 프리뷰 볼 업데이트 ───────────────────────────────────────────────────────
function updatePreview(x) {
  if (!game.previewBody) return;
  game.previewBody.position.x = Math.max(
    FRUIT_CONFIG[game.currentIdx].radius,
    Math.min(640 - FRUIT_CONFIG[game.currentIdx].radius, x)
  );
}

// ─── 과일 투하 ───────────────────────────────────────────────────────────────
function dropFruit(x) {
  if (game.state !== State.READY) return;
  playClick();

  game.state = State.DROP;
  render.canvas.style.cursor = 'default';
  const clampedX = Math.max(
    FRUIT_CONFIG[game.currentIdx].radius,
    Math.min(640 - FRUIT_CONFIG[game.currentIdx].radius, x)
  );

  Composite.add(engine.world, makeFruitBody(clampedX, PREVIEW_Y, game.currentIdx));

  game.currentIdx = game.nextIdx;
  pickNextFruit();
  calcScore();

  if (game.previewBody) Composite.remove(engine.world, game.previewBody);
  game.previewBody = makeFruitBody(render.mouse.position.x, PREVIEW_Y, game.currentIdx, {
    isStatic: true,
    collisionFilter: { mask: 0x0040 },
  });

  setTimeout(() => {
    if (game.state === State.DROP) {
      Composite.add(engine.world, game.previewBody);
      game.state = State.READY;
      render.canvas.style.cursor = 'pointer';
    }
  }, DROP_COOLDOWN);
}

// ─── 게임 오버 ───────────────────────────────────────────────────────────────
function loseGame() {
  if (game.state === State.LOSE) return;
  game.state = State.LOSE;
  calcScore();
  el.endScore.textContent       = `점수: ${game.score}`;
  el.endContainer.style.display = 'flex';
  runner.enabled                = false;
  saveHighscore();
}

// ─── 충돌 이벤트 ─────────────────────────────────────────────────────────────
function onCollision(e) {
  for (const { bodyA, bodyB } of e.pairs) {
    if (bodyA.isStatic || bodyB.isStatic) continue;

    if (bodyA.sizeIndex !== bodyB.sizeIndex) continue;
    if (bodyA.popped || bodyB.popped)        continue;

    const maxIdx   = FRUIT_CONFIG.length - 1;
    const newIdx   = bodyA.sizeIndex >= maxIdx ? 0 : bodyA.sizeIndex + 1;
    const midX     = (bodyA.position.x + bodyB.position.x) / 2;
    const midY     = (bodyA.position.y + bodyB.position.y) / 2;
    const oldIdx   = bodyA.sizeIndex;

    bodyA.popped = true;
    bodyB.popped = true;

    game.mergeCount[oldIdx] += 1;
    playPop(oldIdx);

    Composite.remove(engine.world, [bodyA, bodyB]);
    Composite.add(engine.world, makeFruitBody(midX, midY, newIdx));
    spawnPop(midX, midY, bodyA.circleRadius);
    calcScore();
  }
}

// ─── 투하 가이드 라인 ────────────────────────────────────────────────────────
function drawGuideLine() {
  if (game.state !== State.READY || !game.previewBody) return;

  const ctx    = render.context;
  const x      = game.previewBody.position.x;
  const startY = PREVIEW_Y + FRUIT_CONFIG[game.currentIdx].radius;
  const endY   = 960 - STATUS_H;

  ctx.save();
  ctx.strokeStyle = 'rgba(119, 214, 193, 0.55)'; // Pineapple 32 cyan #77d6c1
  ctx.lineWidth   = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, startY);
  ctx.lineTo(x, endY);
  ctx.stroke();
  ctx.restore();
}

// ─── 위험선 ──────────────────────────────────────────────────────────────────
function drawDangerLine() {
  if (game.state === State.MENU || game.state === State.LOSE) return;

  const ctx = render.context;
  ctx.save();
  ctx.strokeStyle = 'rgba(217, 36, 60, 0.55)'; // Pineapple 32 red #d9243c
  ctx.lineWidth   = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0,   LOSE_Y);
  ctx.lineTo(640, LOSE_Y);
  ctx.stroke();
  ctx.restore();
}

// ─── 게임 시작 ───────────────────────────────────────────────────────────────
function startGame() {
  playClick();

  Composite.add(engine.world, gameBodies);

  game.mergeCount = new Array(FRUIT_CONFIG.length).fill(0);
  calcScore();
  el.ui.style.display       = 'block';
  el.endContainer.style.display = 'none';
  el.endTitle.textContent   = '게임 오버!';
  runner.enabled            = true;

  game.currentIdx  = Math.floor(rand() * (SPAWN_MAX_IDX + 1));
  pickNextFruit();

  game.previewBody = makeFruitBody(320, PREVIEW_Y, game.currentIdx, {
    isStatic: true,
    collisionFilter: { mask: 0x0040 },
  });
  Composite.add(engine.world, game.previewBody);

  setTimeout(() => { game.state = State.READY; }, 250);

  // 마우스/터치 좌표를 Matter.js 경유 없이 직접 변환 (PWA 좌표 오차 방지)
  function toPhysX(clientX) {
    const r = render.canvas.getBoundingClientRect();
    return (clientX - r.left) * (640 / r.width);
  }

  render.canvas.addEventListener('mousemove', e => {
    if (game.state === State.READY) updatePreview(toPhysX(e.clientX));
  });
  render.canvas.addEventListener('mouseup', e => dropFruit(toPhysX(e.clientX)));

  render.canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (game.state === State.READY) updatePreview(toPhysX(e.touches[0].clientX));
  }, { passive: false });
  render.canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (game.state === State.READY) updatePreview(toPhysX(e.touches[0].clientX));
  }, { passive: false });
  render.canvas.addEventListener('touchend', e => {
    e.preventDefault();
    dropFruit(toPhysX(e.changedTouches[0].clientX));
  }, { passive: false });
  Events.on(engine,          'collisionStart', onCollision);

  Events.on(engine, 'afterUpdate', () => {
    if (game.state !== State.READY && game.state !== State.DROP) return;
    const now = Date.now();
    for (const body of Composite.allBodies(engine.world)) {
      if (body.isStatic || body.sizeIndex === undefined) continue;
      if (now - body.droppedAt < DROP_COOLDOWN) continue;
      if (body.position.y + body.circleRadius < LOSE_Y) {
        loseGame();
        return;
      }
    }
  });

  Events.on(render, 'afterRender', drawGuideLine);
  Events.on(render, 'afterRender', drawDangerLine);

  // 테스트용: 숫자키로 다음 과일 지정 (1~9=체리~파인애플, 0=멜론, -=수박)
  const KEY_FRUIT = {
    '1':0, '2':1, '3':2, '4':3, '5':4,
    '6':5, '7':6, '8':7, '9':8, '0':9, '-':10,
  };
  document.addEventListener('keydown', e => {
    if (game.state !== State.READY && game.state !== State.DROP) return;
    const idx = KEY_FRUIT[e.key];
    if (idx === undefined) return;
    game.nextIdx = idx;
    el.nextFruitImg.src = FRUIT_CONFIG[idx].img;
  });
}

// ─── 메뉴 초기화 ─────────────────────────────────────────────────────────────
function initMenu() {
  loadHighscore();
  el.ui.style.display = 'none';

  buildIntroFruits();
  buildEvolutionRing();

  Render.run(render);
  Runner.run(runner, engine);

  el.introStartBtn.addEventListener('click', () => {
    el.introScreen.style.display = 'none';
    render.canvas.style.cursor = 'pointer';
    startGame();
  });
}

// ─── 반응형 리사이즈 ─────────────────────────────────────────────────────────
function resizeCanvas() {
  const sw = document.body.clientWidth;
  const sh = document.body.clientHeight;

  const isMobile = sw < 700;
  const isTablet = sw >= 700 && sw < 1100;

  const sideW = isMobile ? 0 : isTablet ? 180 : 260;
  const gap   = isMobile ? 0 : isTablet ?  32 : 150;
  const padV  = isMobile ? 140 : 64; // 모바일은 상하 패널 공간

  const availW = isMobile
    ? Math.max(sw * 0.80, 200)
    : Math.max(sw - (sideW + gap) * 2 - 48, 200);
  const availH = sh - padV;

  let w, h, scale;
  if (availW * 1.5 > availH) {
    h     = Math.min(960, availH);
    w     = h / 1.5;
    scale = h / 960;
  } else {
    w     = Math.min(640, availW);
    h     = w * 1.5;
    scale = w / 640;
  }

  render.canvas.style.width  = `${w}px`;
  render.canvas.style.height = `${h}px`;
  el.ui.style.width          = '640px';
  el.ui.style.height         = '960px';
  el.ui.style.transform      = `scale(${scale})`;

  engine.gravity.y = 1 / scale;

  const sideRight = document.getElementById('side-right');
  sideRight.style.height = isMobile ? 'auto' : `${h - (isTablet ? 64 : 128)}px`;
}

window.addEventListener('load',   resizeCanvas);
window.addEventListener('resize', resizeCanvas);

initMenu();
