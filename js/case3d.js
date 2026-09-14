// 3D-корпус: карточка «Первая кровь» в каталоге и экран «На чём это работает».
// Модель перенесена из design/Gaming_PC_3D__standalone_.html (Claude Design, версия от 15.09.2026;
// предыдущая — design/Gaming_PC_3D__standalone__v1.html).
// Рендерер один на всё приложение: холст переносится между карточкой и экраном 3 через attach().
//
// Режимы:
//  - 'card'  — корпус собран, подсветка горит, камера плавно покачивается; тап достаётся карточке;
//  - 'stage' — детали влетают по очереди, корпус вращается пальцем, строки списка обводят детали.
//
// Что изменено относительно дизайна (ТЗ §7):
//  - three.js лежит локально (vendor/three), экспортёры OBJ и GLTF выброшены;
//  - детали влетают по очереди: плата → процессор → память → накопитель → видеокарта,
//    последними — блок питания, кабели и передние вентиляторы; потом загорается подсветка;
//  - рендер останавливается, когда корпус не виден (IntersectionObserver и document.hidden);
//  - вместо 4 точечных + 2 направленных + общего (и ещё 3 источников сцены) — студийное окружение
//    (блики почти бесплатны), два направленных, общий, полусферный и один слабый точечный; свечение дают светящиеся материалы
//    и ореолы-спрайты, которые загораются вместе с подсветкой; теней нет;
//  - текстура платы 512 px вместо 1024 и с фиксированным рисунком — одинаковая в карточке и на экране 3;
//  - повторяющиеся детали склеены: в каждой детали один меш на материал, лопасти — один меш на ротор.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TIMING = { start: 150, step: 340, fly: 480, glow: 500 }; // мс
const FLY_FROM = new THREE.Vector3(0.3, 0.1, 0); // деталь влетает из открытого бока корпуса
const GLOW = { accent: 1.0, accentSoft: 0.4, light: 0.06 };
const FRAMING = { card: 0.95, stage: 1.08 };  // запас вокруг корпуса в кадре
const SWING = { speed: 0.5, angle: 0.6 };      // покачивание на карточке: скорость и амплитуда, рад
const SLOW_FRAME_MS = 50; // средний кадр дольше 50 мс (меньше 20 к/с) — телефон не тянет
const WARMUP_FRAMES = 45;
const SAMPLE_FRAMES = 90;

const clamp01 = v => Math.max(0, Math.min(1, v));

export function createCase3D(initialContainer, initialMode, { onAssembled, onSlow, onFail } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // фон даёт карточка или блок корпуса
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  const { model, parts, spinners, materials, glows, textures, accentLight, outlines } = buildModel();
  scene.add(model);

  scene.environment = studioEnvironment(renderer);
  Object.values(materials).forEach(m => { m.envMapIntensity = 0.75; });

  // Кадрирование — по мешам корпуса и деталей: без ореолов и контуров подсветки.
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  model.traverse(o => { if (o.isMesh) bounds.expandByObject(o); });
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const target = sphere.center;
  // Исходный ракурс как в дизайне: сбоку-спереди, открытым боком к зрителю.
  const home = new THREE.Spherical().setFromVector3(new THREE.Vector3(1, 0.55, 1.25));
  const orbit = new THREE.Spherical();

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.enableZoom = false; // колесо и щипок остаются прокрутке страницы
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.42;
  controls.rotateSpeed = 0.8;

  renderer.compile(scene, camera); // шейдеры заранее, чтобы первый кадр не подвисал

  let container = null;
  let mode = null;
  let dist = 1;
  let t0 = 0;
  let pendingStart = false;
  let assembled = false;
  let notify = true;
  let disposed = false;
  let running = false;
  let inView = false;
  let last = 0;
  let swing = 0;
  let watched = 0;
  let slowSum = 0;
  let watchdogDone = false;

  const renderIdle = () => { if (!running && !disposed) renderer.render(scene, camera); };

  /* ---------- Сборка ---------- */

  function setGlow(g) {
    materials.accent.emissiveIntensity = GLOW.accent * g;
    materials.accentSoft.emissiveIntensity = GLOW.accentSoft * g;
    accentLight.intensity = GLOW.light * g;
    for (const s of glows) {
      s.material.opacity = s.userData.opacity * g;
      s.visible = g > 0;
    }
  }

  function applyTimeline(t) {
    parts.forEach((p, i) => {
      const k = clamp01((t - TIMING.start - i * TIMING.step) / TIMING.fly);
      const eased = 1 - Math.pow(1 - k, 3);
      p.visible = k > 0;
      p.position.copy(FLY_FROM).multiplyScalar(1 - eased);
    });
    const glowAt = TIMING.start + (parts.length - 1) * TIMING.step + TIMING.fly;
    setGlow(clamp01((t - glowAt) / TIMING.glow));
    if (t >= glowAt + TIMING.glow && !assembled) {
      assembled = true;
      if (notify && onAssembled) onAssembled();
    }
  }

  // Сразу конечный кадр сборки; withNotify — сообщить приложению (экран 3), для карточки не нужно.
  function finish(withNotify) {
    pendingStart = false;
    notify = withNotify;
    applyTimeline(Infinity);
    notify = true;
  }

  function replay() {
    assembled = false;
    pendingStart = true; // отсчёт — с первого видимого кадра
    applyTimeline(0);
    renderIdle();
  }

  function skip() {
    if (assembled) return;
    finish(true);
    renderIdle();
  }

  function highlight(key) {
    Object.values(outlines).forEach(o => { o.visible = false; });
    if (outlines[key]) outlines[key].visible = true;
    renderIdle();
  }

  /* ---------- Камера ---------- */

  function placeCamera(azimuth) {
    orbit.set(dist, home.phi, azimuth);
    camera.position.setFromSpherical(orbit).add(target);
    camera.lookAt(target);
  }

  // Корпус целиком в кадре и в широком блоке, и в высокой карточке.
  function resize() {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const fit = Math.min(half, Math.atan(Math.tan(half) * camera.aspect));
    dist = sphere.radius / Math.tan(fit) * FRAMING[mode];
    camera.near = dist / 50;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    const dir = camera.position.clone().sub(target);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0.55, 1.25);
    camera.position.copy(target).add(dir.setLength(dist));
    camera.lookAt(target);
    if (mode === 'stage') controls.update();
    renderIdle();
  }

  /* ---------- Цикл отрисовки ---------- */

  function frame(now) {
    if (disposed) return;
    if (pendingStart) { t0 = now; pendingStart = false; }
    const raw = last ? now - last : 0;
    const dt = Math.min(raw, 50);
    last = now;
    if (!assembled) applyTimeline(now - t0);
    if (assembled) {
      for (const s of spinners) s.rotor.rotateZ(s.speed * dt / 1000);
    }
    if (mode === 'card') {
      swing += dt / 1000;
      placeCamera(home.theta + Math.sin(swing * SWING.speed) * SWING.angle);
    } else {
      controls.update();
    }
    renderer.render(scene, camera);
    if (assembled && raw > 0 && !watchdogDone) watch(raw);
  }

  // Если вращение дёргается — откат на рисованный корпус (ТЗ §7).
  function watch(frameMs) {
    watched++;
    if (watched <= WARMUP_FRAMES) return;
    slowSum += frameMs;
    if (watched < WARMUP_FRAMES + SAMPLE_FRAMES) return;
    watchdogDone = true;
    if (slowSum / SAMPLE_FRAMES > SLOW_FRAME_MS && onSlow) onSlow();
  }

  function sync() {
    const on = inView && !document.hidden && !disposed;
    if (on === running) return;
    running = on;
    last = 0;
    renderer.setAnimationLoop(on ? frame : null);
  }

  const io = new IntersectionObserver(entries => {
    inView = entries[entries.length - 1].isIntersecting;
    sync();
  });
  const ro = new ResizeObserver(resize);
  document.addEventListener('visibilitychange', sync);

  /* ---------- Перенос между карточкой и экраном 3 ---------- */

  function attach(next, nextMode) {
    if (disposed || !next) return;
    if (next === container && nextMode === mode) return;
    container = next;
    mode = nextMode;
    container.appendChild(canvas);
    io.disconnect();
    io.observe(container);
    ro.disconnect();
    ro.observe(container);
    inView = false;
    sync();

    const stage = mode === 'stage';
    controls.enabled = stage;
    canvas.style.touchAction = stage ? 'pan-y' : 'auto'; // в каталоге свайп листает список
    highlight(null);
    if (!stage) {
      swing = 0;
      finish(false);
    }
    resize();
    placeCamera(home.theta);
    if (stage) controls.update();
    renderIdle();
  }

  // На экране 3 тап пропускает сборку, а поворот пальцем — нет.
  let downAt = null;
  const onDown = e => { downAt = [e.clientX, e.clientY]; };
  const onClick = e => {
    if (mode !== 'stage') return;
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) e.stopPropagation();
  };
  const onLost = e => {
    e.preventDefault();
    if (onFail) onFail();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('webglcontextlost', onLost);

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('webglcontextlost', onLost);
    controls.dispose();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    textures.forEach(t => t.dispose());
    if (scene.environment) scene.environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  applyTimeline(0);
  attach(initialContainer, initialMode);
  return { attach, replay, skip, highlight, dispose };
}

/* ---------- Окружение и текстуры ---------- */

// Мягкое студийное окружение из дизайна: холодный блик сверху, тёмный пол, слабая оранжевая полоса.
function studioEnvironment(renderer) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  const lin = g.createLinearGradient(0, 0, 0, 256);
  lin.addColorStop(0, '#454b54');
  lin.addColorStop(0.42, '#1B1E22');
  lin.addColorStop(0.62, '#101214');
  lin.addColorStop(1, '#070809');
  g.fillStyle = lin;
  g.fillRect(0, 0, 512, 256);
  const soft = g.createRadialGradient(150, 40, 0, 150, 40, 150);
  soft.addColorStop(0, 'rgba(255,255,255,0.55)');
  soft.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = soft;
  g.fillRect(0, 0, 512, 256);
  const acc = g.createRadialGradient(400, 150, 0, 400, 150, 130);
  acc.addColorStop(0, 'rgba(226,88,63,0.3)');
  acc.addColorStop(1, 'rgba(226,88,63,0)');
  g.fillStyle = acc;
  g.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

// Рисунок печатной платы. Случайность с фиксированным зерном — рисунок всегда одинаковый.
function pcbTexture(px) {
  let seed = 5060;
  const rnd = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const S = px / 1024;
  g.fillStyle = '#242424';
  g.fillRect(0, 0, px, px);
  // широкие полигоны земли
  g.fillStyle = '#2B2B2B';
  for (const [x, y, w, h] of [[40, 40, 420, 210], [560, 300, 400, 260], [60, 640, 380, 320]]) {
    g.fillRect(x * S, y * S, w * S, h * S);
  }
  // пучки дорожек: прямые, потом диагональ
  const bundle = (x, y, len, n, step, horiz, color, lw) => {
    g.strokeStyle = color;
    g.lineWidth = lw * S;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const o = (y + i * step) * S;
      if (horiz) { g.moveTo(x * S, o); g.lineTo((x + len) * S, o); }
      else { g.moveTo(o, x * S); g.lineTo(o, (x + len) * S); }
    }
    g.stroke();
  };
  bundle(70, 90, 400, 9, 16, true, '#333333', 2.2);
  bundle(120, 300, 330, 7, 20, true, '#303030', 2.6);
  bundle(600, 120, 300, 11, 14, true, '#323232', 2);
  bundle(660, 120, 260, 8, 22, false, '#2F2F2F', 2.4);
  bundle(180, 520, 300, 12, 15, false, '#343434', 2);
  g.save();
  g.translate(px * 0.5, px * 0.72);
  g.rotate(-Math.PI / 4);
  bundle(-160, -70, 320, 10, 17, true, '#2F2F2F', 2.2);
  g.restore();
  // переходные отверстия
  for (let i = 0; i < 420; i++) {
    const x = rnd() * px, y = rnd() * px, r = (1.6 + rnd() * 2.2) * S;
    g.fillStyle = rnd() > 0.35 ? '#3A3A3A' : '#454545';
    g.beginPath();
    g.arc(x, y, r, 0, 6.3);
    g.fill();
  }
  // посадочные места компонентов с контуром шелкографии
  g.lineWidth = 2 * S;
  for (let i = 0; i < 26; i++) {
    const x = rnd() * (px - 120 * S), y = rnd() * (px - 90 * S);
    const w = (14 + rnd() * 60) * S, h = (10 + rnd() * 26) * S;
    g.fillStyle = '#1D1D1D';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#5A5A5A';
    g.strokeRect(x, y, w, h);
  }
  // штрихи маркировки
  g.fillStyle = '#6E6E6E';
  for (let i = 0; i < 90; i++) {
    g.fillRect(rnd() * px, rnd() * px, (8 + rnd() * 22) * S, 3 * S);
  }
  // несколько акцентных меток
  g.fillStyle = '#E2583F';
  for (const [x, y, w, h] of [[80, 470, 90, 5], [620, 690, 70, 5], [430, 180, 5, 70]]) {
    g.fillRect(x * S, y * S, w * S, h * S);
  }
  // рамка сокета
  g.strokeStyle = '#7A7A7A';
  g.lineWidth = 3 * S;
  g.strokeRect(300 * S, 120 * S, 240 * S, 240 * S);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Мягкий ореол для свечения — дешёвая замена bloom.
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(226,88,63,0.95)');
  rg.addColorStop(0.28, 'rgba(226,88,63,0.42)');
  rg.addColorStop(0.62, 'rgba(226,88,63,0.12)');
  rg.addColorStop(1, 'rgba(226,88,63,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- Модель ---------- */

function buildModel() {
  const std = (color, roughness, metalness) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  const pcbMap = pcbTexture(512);
  const glowMap = glowTexture();
  const M = {
    frame: std(0x222222, 0.55, 0.35),
    panel: std(0x2A2A2A, 0.7, 0.2),
    board: std(0x323232, 0.85, 0.1),
    metal: std(0x565656, 0.42, 0.45),
    pcb: new THREE.MeshStandardMaterial({ map: pcbMap, color: 0xFFFFFF, roughness: 0.82, metalness: 0.08 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xE2583F, emissive: 0xE2583F,
      emissiveIntensity: GLOW.accent, roughness: 0.45, flatShading: true }),
    accentSoft: new THREE.MeshStandardMaterial({ color: 0xE2583F, emissive: 0xE2583F,
      emissiveIntensity: GLOW.accentSoft, roughness: 0.6, flatShading: true })
  };

  // Одинаковые детали берут одну геометрию; после склейки кэш освобождается.
  const cache = new Map();
  const geo = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo('box' + w + '|' + h + '|' + d, () => new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    return m;
  };
  const cyl = (r, h, seg, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo('cyl' + r + '|' + h + '|' + seg, () => new THREE.CylinderGeometry(r, r, h, seg)), mat);
    m.position.set(x, y, z);
    return m;
  };
  const tube = (points, r, mat) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 26, r, 6, false), mat);
  };
  const glows = [];
  const glow = (size, opacity, x, y, z, sizeY = size) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity }));
    s.scale.set(size, sizeY, 1);
    s.position.set(x, y, z);
    s.userData.opacity = opacity;
    glows.push(s);
    return s;
  };

  // x — ширина, y — высота, z — глубина. Открытый бок смотрит в +X, перед — в +Z.
  const W = 0.215, H = 0.54, D = 0.42;
  const hx = W / 2, hz = D / 2, t = 0.008;
  const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  /* Корпус */
  const shell = new THREE.Group();
  shell.add(box(W, t, D, M.panel, 0, t / 2, 0));
  shell.add(box(W, t, D, M.panel, 0, H - t / 2, 0));
  shell.add(box(t, H, D, M.frame, -hx + t / 2, H / 2, 0));
  shell.add(box(W - t * 2, H - t * 2, t, M.frame, 0, H / 2, -hz + t / 2));
  shell.add(box(W * 0.6, 0.052, 0.004, M.metal, -0.014, H - 0.07, -hz + t + 0.002));
  for (let i = 0; i < 5; i++) shell.add(box(0.02, 0.007, 0.004, M.metal, 0.026, 0.235 - i * 0.02, -hz + t + 0.002));
  shell.add(box(t * 1.5, H, 0.013, M.panel, -hx + t * 0.75, H / 2, hz + 0.012));
  shell.add(box(t * 1.5, H, 0.013, M.panel, hx - t * 0.75, H / 2, hz + 0.012));
  for (let i = 0; i < 13; i++) shell.add(box(W - t * 3, 0.015, 0.011, M.panel, 0, 0.03 + i * 0.039, hz + 0.012));
  shell.add(box(0.013, H, 0.018, M.frame, hx - 0.0065, H / 2, hz - 0.011));
  shell.add(box(0.013, H, 0.018, M.frame, hx - 0.0065, H / 2, -hz + 0.011));
  shell.add(box(0.013, 0.012, D, M.frame, hx - 0.0065, H - 0.013, 0));
  shell.add(box(0.013, 0.012, D, M.frame, hx - 0.0065, 0.013, 0));
  for (const [sx, sz] of CORNERS) shell.add(box(0.028, 0.013, 0.028, M.frame, sx * (hx - 0.028), -0.0065, sz * (hz - 0.038)));
  const shroudY = 0.105;
  shell.add(box(W - t * 2, t, D * 0.82, M.panel, 0, shroudY, -0.028));
  shell.add(box(W - t * 2, shroudY, t, M.panel, 0, shroudY / 2, 0.144));
  shell.add(box(t, shroudY, D * 0.82, M.frame, -hx + t * 1.6, shroudY / 2, -0.028));
  for (let i = 0; i < 7; i++) shell.add(box(0.02, 0.004, D * 0.5, M.frame, -0.07 + i * 0.023, H - t - 0.001, -0.02));
  shell.add(box(0.085, 0.003, 0.004, M.accentSoft, 0.03, shroudY + t / 2 + 0.002, 0.1));

  /* Вентиляторы */
  const spinners = [];
  function makeFan(r, speed, guard) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo('ring' + r, () => new THREE.TorusGeometry(r, 0.009, 5, 24)), M.frame));
    for (const [sx, sy] of CORNERS) g.add(box(0.019, 0.019, 0.017, M.frame, sx * r * 0.95, sy * r * 0.95, 0));
    const led = new THREE.Mesh(geo('led' + r, () => new THREE.TorusGeometry(r * 0.94, 0.0035, 4, 24)), M.accent);
    led.position.z = 0.009;
    g.add(led);
    const rotor = new THREE.Group();
    rotor.userData.dynamic = true;
    const hub = new THREE.Mesh(geo('hub' + r, () => new THREE.CylinderGeometry(r * 0.32, r * 0.32, 0.015, 10)), M.metal);
    hub.rotation.x = Math.PI / 2;
    rotor.add(hub);
    const cap = new THREE.Mesh(geo('cap' + r, () => new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.019, 8)), M.accent);
    cap.rotation.x = Math.PI / 2;
    rotor.add(cap);
    for (let i = 0; i < 7; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 7) * Math.PI * 2;
      const blade = box(r * 0.62, r * 0.46, 0.004, M.metal, r * 0.62, 0, 0);
      blade.rotation.x = 0.6;
      arm.add(blade);
      rotor.add(arm);
    }
    g.add(rotor);
    if (guard) {
      const grill = new THREE.Group();
      for (let i = 1; i <= 3; i++) {
        const rr = r * (0.3 + i * 0.22);
        grill.add(new THREE.Mesh(geo('guard' + rr, () => new THREE.TorusGeometry(rr, 0.0018, 4, 22)), M.frame));
      }
      for (let i = 0; i < 6; i++) {
        const spoke = box(0.0028, r * 1.85, 0.0028, M.frame);
        spoke.rotation.z = (i / 6) * Math.PI;
        grill.add(spoke);
      }
      grill.position.z = 0.014;
      g.add(grill);
    }
    spinners.push({ rotor, speed });
    return g;
  }

  /* Детали — в порядке влёта */
  const mbX = -hx + t + 0.005;

  const board = new THREE.Group();
  board.add(box(0.005, 0.33, 0.29, M.pcb, mbX, 0.345, -0.032));
  board.add(box(0.004, 0.06, 0.055, M.frame, mbX + 0.005, 0.215, -0.04));
  board.add(box(0.004, 0.045, 0.06, M.frame, mbX + 0.005, 0.485, -0.075));
  for (let i = 0; i < 2; i++) board.add(box(0.006, 0.008, 0.13, M.frame, mbX + 0.005, 0.245 - i * 0.06, -0.05));
  board.add(box(0.006, 0.028, 0.004, M.accentSoft, mbX + 0.006, 0.5, 0.09));
  for (let i = 0; i < 7; i++) board.add(box(0.008, 0.009, 0.009, M.metal, mbX + 0.006, 0.502, -0.12 + i * 0.014)); // дроссели VRM
  for (let i = 0; i < 5; i++) {
    const c = cyl(0.0035, 0.009, 8, M.metal, mbX + 0.0085, 0.45 - i * 0.012, -0.145); // конденсаторы
    c.rotation.z = Math.PI / 2;
    board.add(c);
  }
  board.add(box(0.011, 0.046, 0.011, M.frame, mbX + 0.007, 0.41, 0.1)); // 24-pin ATX
  for (let i = 0; i < 4; i++) board.add(box(0.009, 0.008, 0.012, M.frame, mbX + 0.006, 0.222, 0.075 + i * 0.015)); // SATA
  board.add(box(0.008, 0.007, 0.03, M.frame, mbX + 0.006, 0.192, 0.045)); // разъём передней панели
  for (const [y, z] of [[0.5, -0.16], [0.5, 0.1], [0.2, -0.16], [0.2, 0.1], [0.35, -0.03]]) {
    const s = cyl(0.0022, 0.004, 6, M.metal, mbX + 0.004, y, z); // винты
    s.rotation.z = Math.PI / 2;
    board.add(s);
  }

  const cY = 0.425, cZ = -0.05;
  const cpu = new THREE.Group();
  cpu.add(box(0.05, 0.1, 0.085, M.metal, mbX + 0.048, cY, cZ));
  for (let i = 0; i < 8; i++) cpu.add(box(0.054, 0.003, 0.088, M.frame, mbX + 0.048, cY - 0.045 + i * 0.0128, cZ));
  cpu.add(box(0.048, 0.011, 0.082, M.frame, mbX + 0.048, cY + 0.056, cZ));
  cpu.add(box(0.026, 0.004, 0.02, M.accent, mbX + 0.048, cY + 0.063, cZ));
  for (let i = 0; i < 4; i++) cpu.add(cyl(0.0042, 0.012, 8, M.metal, mbX + 0.032 + i * 0.011, cY + 0.062, cZ - 0.028)); // тепловые трубки
  cpu.add(box(0.062, 0.014, 0.02, M.frame, mbX + 0.048, cY - 0.056, cZ)); // крепёжная планка
  cpu.add(box(0.006, 0.05, 0.05, M.metal, mbX + 0.005, cY - 0.012, cZ)); // рамка сокета
  const cpuFan = makeFan(0.043, 5.4);
  cpuFan.position.set(mbX + 0.048, cY, cZ + 0.056);
  cpu.add(cpuFan);

  const ram = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const z = 0.025 + i * 0.027;
    ram.add(box(0.007, 0.095, 0.015, M.frame, mbX + 0.012, 0.465, z));
    ram.add(box(0.008, 0.009, 0.015, M.accent, mbX + 0.012, 0.517, z));
    ram.add(box(0.006, 0.014, 0.017, M.board, mbX + 0.008, 0.412, z)); // слот
    for (let k = 0; k < 4; k++) ram.add(box(0.0085, 0.003, 0.015, M.metal, mbX + 0.012, 0.478 + k * 0.009, z)); // радиатор
  }

  const ssd = new THREE.Group();
  ssd.add(box(0.006, 0.005, 0.07, M.metal, mbX + 0.005, 0.295, -0.075));
  ssd.add(box(0.007, 0.003, 0.018, M.accent, mbX + 0.006, 0.299, -0.075));

  const gY = 0.185;
  const gpu = new THREE.Group();
  gpu.add(box(0.11, 0.004, 0.245, M.board, mbX + 0.06, gY - 0.019, -0.04));
  gpu.add(box(0.106, 0.036, 0.235, M.frame, mbX + 0.06, gY, -0.04));
  gpu.add(box(0.07, 0.003, 0.035, M.accentSoft, mbX + 0.055, gY + 0.0195, 0.03));
  gpu.add(box(0.014, 0.032, 0.055, M.metal, mbX + 0.005, gY - 0.003, -0.135));
  for (let i = 0; i < 3; i++) gpu.add(box(0.004, 0.011, 0.014, M.board, mbX - 0.0005, gY - 0.006, -0.152 + i * 0.017)); // порты
  gpu.add(box(0.104, 0.005, 0.23, M.metal, mbX + 0.06, gY - 0.023, -0.04)); // бэкплейт
  for (let i = 0; i < 5; i++) gpu.add(box(0.1, 0.002, 0.004, M.frame, mbX + 0.062, gY + 0.0185, -0.11 + i * 0.03)); // рёбра кожуха
  gpu.add(box(0.016, 0.012, 0.03, M.frame, mbX + 0.085, gY + 0.024, -0.03)); // разъём питания
  gpu.add(box(0.008, 0.038, 0.06, M.frame, mbX + 0.1, gY, -0.04));
  for (let i = 0; i < 2; i++) {
    const f = makeFan(0.038, 3.6);
    f.rotation.x = Math.PI / 2;
    f.position.set(mbX + 0.06, gY - 0.021, -0.1 + i * 0.1);
    gpu.add(f);
  }

  const psu = new THREE.Group();
  psu.add(box(0.145, 0.078, 0.135, M.frame, -0.012, 0.048, -0.09));
  const psuFan = makeFan(0.046, 2.3);
  psuFan.rotation.x = -Math.PI / 2;
  psuFan.position.set(-0.012, 0.088, -0.09);
  psu.add(psuFan);
  psu.add(box(0.075, 0.026, 0.006, M.board, -0.012, 0.044, -0.02));
  for (let i = 0; i < 6; i++) psu.add(box(0.003, 0.05, 0.09, M.frame, -0.075 + i * 0.008, 0.048, -0.09)); // решётка

  const power = new THREE.Group();
  power.add(psu);
  // кабели в оплётке: из кожуха к плате и видеокарте
  power.add(tube([[-0.02, 0.1, 0.03], [-0.045, 0.19, 0.085], [-0.072, 0.31, 0.103], [-0.0855, 0.392, 0.1]], 0.0055, M.frame));
  power.add(tube([[-0.006, 0.1, 0.0], [-0.012, 0.15, 0.03], [-0.026, 0.2, 0.01], [-0.0155, 0.222, -0.028]], 0.0045, M.frame));
  power.add(tube([[-0.05, 0.1, 0.055], [-0.07, 0.15, 0.08], [-0.084, 0.2, 0.085]], 0.0035, M.frame));
  for (let i = 0; i < 2; i++) {
    const f = makeFan(0.064, i ? -4.2 : -3.5, true);
    f.position.set(-0.006, 0.2 + i * 0.15, hz - 0.026);
    power.add(f);
  }

  const parts = [board, cpu, ram, ssd, gpu, power];
  const guts = new THREE.Group();
  parts.forEach(p => { p.userData.dynamic = true; guts.add(p); });

  const model = new THREE.Group();
  model.add(shell, guts);

  // Контуры для подсветки строки в списке — считаются до склейки, пока детали на местах.
  model.updateMatrixWorld(true);
  const outline = obj => {
    const helper = new THREE.Box3Helper(new THREE.Box3().setFromObject(obj).expandByScalar(0.004), 0xE2583F);
    helper.material.depthTest = false;
    helper.renderOrder = 10;
    helper.visible = false;
    model.add(helper);
    return helper;
  };
  const cpuOutline = outline(cpu);
  const outlines = {
    chassis: outline(shell), mb: outline(board), cpu: cpuOutline, cooler: cpuOutline,
    ram: outline(ram), ssd: outline(ssd), gpu: outline(gpu), psu: outline(psu)
  };

  bake(shell);
  parts.forEach(bake);
  cache.forEach(g => g.dispose());

  // Ореолы: у деталей — летят вместе с ними; общие — загораются с подсветкой.
  cpu.add(glow(0.15, 0.55, mbX + 0.05, cY, cZ + 0.05));
  gpu.add(glow(0.13, 0.4, mbX + 0.055, gY + 0.03, 0.02));
  ram.add(glow(0.1, 0.32, mbX + 0.014, 0.515, 0.038));
  for (let i = 0; i < 2; i++) power.add(glow(0.2, 0.5, -0.006, 0.2 + i * 0.15, hz - 0.05));
  const ambience = new THREE.Group();
  ambience.add(glow(0.16, 0.22, 0.02, shroudY + 0.02, 0.08));
  ambience.add(glow(0.3, 0.16, 0.0, 0.3, 0.02));
  ambience.add(glow(0.55, 0.17, 0.0, 0.01, 0.05, 0.3)); // пятно света на полу
  guts.add(ambience);

  // Свет: направленный в открытый бок, ключевой сверху, общий, полусферный и слабый оранжевый внутри.
  // Блики даёт окружение; точечный — один вместо четырёх.
  const fill = new THREE.DirectionalLight(0xCFD3D8, 3.6);
  fill.position.set(0.55, 0.55, 0.4);
  fill.target.position.set(-0.06, 0.28, -0.02);
  model.add(fill, fill.target);
  model.add(new THREE.AmbientLight(0xB8BEC6, 0.85));
  model.add(new THREE.HemisphereLight(0xBFC4CC, 0x0A0A0A, 0.55));
  const key = new THREE.DirectionalLight(0xFFFFFF, 1.9); // сверху-спереди: верх и перед корпуса не проваливаются в чёрное
  key.position.set(4, 7, 5);
  model.add(key);
  const accentLight = new THREE.PointLight(0xE2583F, 0, 0.45, 2);
  accentLight.position.set(0.02, 0.32, 0.04);
  model.add(accentLight);

  model.rotation.y = -0.26; // вполоборота, открытым боком к камере
  return { model, parts, spinners, materials: M, glows, textures: [pcbMap, glowMap], accentLight, outlines };
}

// Склейка: все неподвижные меши внутри узла сливаются в один меш на материал.
// Узлы с userData.dynamic (детали, роторы) остаются отдельными и склеиваются внутри себя.
function bake(root) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map();
  const dynamic = [];

  (function walk(node) {
    for (const child of node.children) {
      if (child.userData.dynamic) { dynamic.push(child); continue; }
      if (child.isMesh) {
        const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        g.applyMatrix4(rel.multiplyMatrices(toRoot, child.matrixWorld));
        if (!buckets.has(child.material)) buckets.set(child.material, []);
        buckets.get(child.material).push(g);
      }
      walk(child);
    }
  })(root);

  for (const d of dynamic) rel.multiplyMatrices(toRoot, d.matrixWorld).decompose(d.position, d.quaternion, d.scale);
  root.clear();
  buckets.forEach((list, material) => root.add(new THREE.Mesh(merge(list), material)));
  dynamic.forEach(d => { root.add(d); bake(d); });
}

// Склеивает геометрии: позиции, нормали и UV (UV нужны плате с текстурой).
function merge(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const withUv = list.every(g => g.attributes.uv);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = withUv ? new Float32Array(count * 2) : null;
  let offset = 0;
  for (const g of list) {
    position.set(g.attributes.position.array, offset * 3);
    normal.set(g.attributes.normal.array, offset * 3);
    if (uv) uv.set(g.attributes.uv.array, offset * 2);
    offset += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
