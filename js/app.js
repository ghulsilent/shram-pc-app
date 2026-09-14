// Shram PC — логика мини-приложения. Данные лежат в builds.js и games.js.
(function () {
  'use strict';

  const BUILDS = window.SHRAM_BUILDS || [];
  // Игры без замеров (base: null) не показываем — см. комментарии в games.js.
  const GAMES = (window.SHRAM_GAMES || []).filter(g => g.base > 0 && g.cap > 0);

  // Формула: min(base × разрешение × качество, cap), диапазон ±10%, округление до 5.
  const RESOLUTIONS = [
    { id: '1080p', k: 1 },
    { id: '1440p', k: 0.7 },
    { id: '4K', k: 0.45 }
  ];
  const QUALITIES = [
    { id: 'средние', k: 1.25 },
    { id: 'высокие', k: 1 },
    { id: 'ультра', k: 0.8 }
  ];
  const SPREAD = 0.1;
  const SCALE_MAX = 300;   // правый край шкалы, FPS
  const ZONE_OK = 60;      // от 60 — «комфортно»
  const ZONE_ESPORT = 144; // от 144 — «киберспорт»

  const ORDER_CHAT = 'https://t.me/shram_1';

  // Сколько карточек в каталоге. Пока сборок меньше, пустые места занимают карточки «скоро».
  const CATALOG_SLOTS = 3;

  // Корпус в карточке «Первая кровь» и на экране 3: '3d' — трёхмерный, если устройство тянет;
  // 'svg' — рисованный из дизайна. Для проверки вручную: ?case=3d или ?case=svg в адресе.
  const DEFAULT_CASE = '3d';
  const CASE_STORAGE_KEY = 'shram-case';

  const PARTS = [
    ['gpu', 'ВИДЕОКАРТА'], ['cpu', 'ПРОЦЕССОР'], ['mb', 'ПЛАТА'], ['ram', 'ПАМЯТЬ'],
    ['ssd', 'НАКОПИТЕЛЬ'], ['psu', 'ПИТАНИЕ'], ['cooler', 'ОХЛАЖДЕНИЕ'], ['chassis', 'КОРПУС']
  ];
  // Габариты деталей в рисованном корпусе: [x, y, z, ширина, глубина, высота].
  const PART_BOX = {
    gpu: [32, 8, 62, 92, 34, 11],
    cpu: [52, 8, 92, 28, 28, 26],
    cooler: [52, 8, 92, 28, 28, 26],
    mb: [28, 5, 35, 100, 3, 95],
    ram: [92, 8, 95, 14, 24, 38],
    ssd: [36, 8, 52, 22, 3, 7],
    psu: [12, 5, 5, 58, 58, 30],
    chassis: [0, 0, 0, 150, 70, 150]
  };
  const ASSEMBLY_MS = 2650; // рисованный корпус: последней загорается подсветка, 1,95 с + 0,7 с

  const STRIPES = '<svg class="stripes" aria-hidden="true"><rect width="100%" height="100%" fill="url(#shStripe)"/></svg>';

  /* ---------- Telegram ---------- */

  const tg = window.Telegram && window.Telegram.WebApp;
  // SDK вне Telegram тоже создаёт объект, но с platform = 'unknown'.
  const inTelegram = !!(tg && tg.platform && tg.platform !== 'unknown');

  function tgCall(minVersion, fn) {
    if (!inTelegram) return;
    if (minVersion && !tg.isVersionAtLeast(minVersion)) return;
    try { fn(tg); } catch (e) { /* старый клиент без этой функции */ }
  }

  const haptic = style => tgCall('6.1', t => t.HapticFeedback.impactOccurred(style));

  // Метка источника: t.me/shram_pc_bot/build?startapp=tiktok → «tiktok».
  function readSource() {
    let tag = inTelegram && tg.initDataUnsafe ? tg.initDataUnsafe.start_param : '';
    if (!tag) {
      // Проверка в обычном браузере: index.html?startapp=tiktok
      const q = new URLSearchParams(location.search);
      tag = q.get('tgWebAppStartParam') || q.get('startapp') || '';
    }
    return /^[\w-]{1,64}$/.test(tag || '') ? tag : 'direct';
  }

  /* ---------- Состояние ---------- */

  const state = {
    screen: 'catalog',
    game: null,
    build: 0,
    res: '1080p',
    q: 'высокие',
    lo: 0,
    hi: 0,
    hl: null,
    assembled: false,
    source: readSource()
  };

  const $ = id => document.getElementById(id);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const currentBuild = () => BUILDS[state.build];
  const currentGame = () => GAMES.find(g => g.id === state.game);
  const formatPrice = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';

  /* ---------- Расчёт FPS ---------- */

  function calc() {
    const game = currentGame();
    const build = currentBuild();
    const rk = RESOLUTIONS.find(r => r.id === state.res).k;
    const qk = QUALITIES.find(q => q.id === state.q).k;
    const byGpu = game.base * (build.gpuIndex || 100) / 100 * rk * qk;
    const cap = (build.cpuCaps && build.cpuCaps[game.id]) || game.cap;
    const v = Math.min(byGpu, cap);
    const r5 = n => Math.max(5, Math.round(n / 5) * 5);
    return { lo: r5(v * (1 - SPREAD)), hi: r5(v * (1 + SPREAD)) };
  }

  function setFps(lo, hi) {
    state.lo = lo;
    state.hi = hi;
    $('fpsNum').textContent = lo + '–' + hi;
    const mid = (lo + hi) / 2;
    const left = Math.max(1.5, Math.min(98.5, mid / SCALE_MAX * 100)).toFixed(1) + '%';
    $('marker').style.left = left;
    $('markerTip').style.left = left;
    const zones = $('zones').children;
    zones[0].classList.toggle('on', mid < ZONE_OK);
    zones[1].classList.toggle('on', mid >= ZONE_OK && mid < ZONE_ESPORT);
    zones[2].classList.toggle('on', mid >= ZONE_ESPORT);
  }

  // Перебор чисел: 8 шагов по 42 мс, в конце — средняя вибрация.
  let rollTimer = null;
  function roll() {
    clearInterval(rollTimer);
    const t = calc();
    const lo0 = state.lo;
    const hi0 = state.hi;
    let n = 0;
    rollTimer = setInterval(() => {
      n++;
      if (n >= 8) {
        clearInterval(rollTimer);
        setFps(t.lo, t.hi);
        haptic('medium');
        return;
      }
      const p = n / 8;
      const jitter = (1 - p) * 22;
      setFps(
        Math.max(5, Math.round(lo0 + (t.lo - lo0) * p + (Math.random() - 0.5) * jitter)),
        Math.max(10, Math.round(hi0 + (t.hi - hi0) * p + (Math.random() - 0.5) * jitter))
      );
    }, 42);
  }

  /* ---------- Экран 0: каталог сборок ---------- */

  // Картинка для карточки без фото — рисованный корпус с экрана 3, в собранном виде.
  // У первой сборки поверх неё встаёт 3D-модель, когда загрузится.
  function caseArt() {
    const svg = $('caseSvg').cloneNode(true);
    svg.querySelector('#hl').remove();
    svg.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    ['id', 'role', 'aria-label'].forEach(a => svg.removeAttribute(a));
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('card-art', 'skip');
    return svg;
  }

  function renderCards() {
    const box = $('cards');
    const art = caseArt();

    BUILDS.forEach((b, i) => {
      const card = el('button', 'card');
      card.type = 'button';

      const img = el('div', 'card-img');
      if (b.image) {
        const photo = el('img');
        photo.src = b.image;
        photo.alt = b.name;
        img.appendChild(photo);
      } else {
        img.innerHTML = STRIPES;
        img.appendChild(art.cloneNode(true));
        if (i === 0) {
          const holder = el('div', 'card-3d');
          holder.id = 'card3d';
          img.appendChild(holder);
        }
      }
      img.appendChild(el('span', 'card-badge', b.stock > 0 ? 'В НАЛИЧИИ ' + b.stock + ' ШТ' : 'НЕТ В НАЛИЧИИ'));

      const body = el('div', 'card-body');
      body.appendChild(el('span', 'card-price', formatPrice(b.price)));
      body.appendChild(el('span', 'card-name', b.name));
      body.appendChild(el('span', 'card-spec', b.parts.gpu));
      body.appendChild(el('span', 'card-spec', b.parts.cpu));
      body.appendChild(el('span', 'card-cta', 'УЗНАТЬ FPS →'));

      card.append(img, body);
      card.addEventListener('click', () => pickBuild(i));
      box.appendChild(card);
    });

    for (let i = BUILDS.length; i < CATALOG_SLOTS; i++) {
      const card = el('div', 'card soon');
      card.setAttribute('aria-label', 'Скоро появится новая сборка');
      const img = el('div', 'card-img');
      img.innerHTML = STRIPES;
      const body = el('div', 'card-body');
      ['55%', '80%', '65%', '45%'].forEach(w => {
        const bar = el('span', 'skeleton');
        bar.style.width = w;
        body.appendChild(bar);
      });
      const label = el('div', 'soon-label');
      label.appendChild(el('b', null, 'СКОРО'));
      label.appendChild(el('small', null, 'новая сборка'));
      card.append(img, body, label);
      box.appendChild(card);
    }
  }

  function pickBuild(i) {
    haptic('light');
    if (state.build !== i) {
      state.build = i;
      syncPressed($('rail'), i);
      renderBuild();
    }
    show('games');
  }

  /* ---------- Экран 1: игры ---------- */

  function renderTiles() {
    const box = $('tiles');
    GAMES.forEach(g => {
      const b = el('button', 'tile');
      b.type = 'button';
      b.dataset.game = g.id;
      b.innerHTML = '<svg aria-hidden="true"><rect width="100%" height="100%" fill="url(#shStripe)"/></svg><span class="dot"></span>';
      b.appendChild(el('span', 'tile-name', g.tile || g.name));
      b.addEventListener('click', () => pickGame(g.id));
      box.appendChild(b);
    });
  }

  function pickGame(id) {
    haptic('light');
    state.game = id;
    for (const t of $('tiles').children) t.classList.toggle('on', t.dataset.game === id);
    $('gameName').textContent = currentGame().name;
    show('result');
    roll();
  }

  /* ---------- Экран 2: результат ---------- */

  function renderSeg(boxId, items, key) {
    const box = $(boxId);
    items.forEach(it => {
      const b = el('button', null, it.id);
      b.type = 'button';
      b.dataset.value = it.id;
      b.addEventListener('click', () => {
        if (state[key] === it.id) return;
        haptic('light');
        state[key] = it.id;
        syncPressed(box, it.id);
        roll();
      });
      box.appendChild(b);
    });
    syncPressed(box, state[key]);
  }

  function syncPressed(box, value) {
    for (const b of box.children) b.setAttribute('aria-pressed', String(b.dataset.value === String(value)));
  }

  function renderRail() {
    if (BUILDS.length < 2) return; // одна сборка — ленты нет
    $('railWrap').hidden = false;
    const box = $('rail');
    BUILDS.forEach((b, i) => {
      const card = el('button', 'build-card');
      card.type = 'button';
      card.dataset.value = String(i);
      card.appendChild(el('b', null, b.name));
      card.appendChild(el('small', null, formatPrice(b.price)));
      card.addEventListener('click', () => {
        if (state.build === i) return;
        haptic('light');
        state.build = i;
        syncPressed(box, i);
        renderBuild();
        roll();
      });
      box.appendChild(card);
    });
    syncPressed(box, state.build);
  }

  /* ---------- Экран 3: на чём это работает ---------- */

  function renderBuild() {
    const b = currentBuild();
    $('gamesTagline').textContent = 'Сколько FPS даст «' + b.name + '»';
    $('buildSub').textContent = '«' + b.name + '» · ' + b.subtitle;
    $('price').textContent = formatPrice(b.price);
    $('stock').textContent = b.stock > 0 ? 'в наличии: ' + b.stock + ' шт' : 'нет в наличии';
    $('warranty').textContent = 'гарантия ' + b.warranty;

    const box = $('parts');
    box.textContent = '';
    PARTS.forEach(([key, label]) => {
      if (!b.parts[key]) return;
      const row = el('button', 'part');
      row.type = 'button';
      row.dataset.value = key;
      row.appendChild(el('span', 'part-key', label));
      row.appendChild(el('span', 'part-val', b.parts[key]));
      row.addEventListener('click', () => {
        state.hl = state.hl === key ? null : key;
        syncPressed(box, state.hl);
        drawHighlight();
      });
      box.appendChild(row);
    });
    state.hl = null;
    syncPressed(box, null);
    drawHighlight();
  }

  // Изометрическая проекция рисованного корпуса, как в дизайне.
  function iso(x, y, z) {
    return (70 + 0.87 * (x - y)).toFixed(1) + ',' + (150 + 0.36 * (x + y) - 0.72 * z).toFixed(1);
  }

  function drawHighlight() {
    if (case3d && state.screen === 'build') case3d.highlight(state.hl);
    const g = $('hl');
    const box = state.hl && PART_BOX[state.hl];
    g.style.display = box ? '' : 'none';
    if (!box) return;
    const [x, y, z, w, d, h] = box;
    const faces = [
      [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)],
      [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)],
      [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)]
    ];
    g.querySelectorAll('polygon').forEach((p, i) => p.setAttribute('points', faces[i].join(' ')));
  }

  let assemblyTimer = null;
  const using3d = () => $('caseBox').classList.contains('is-3d');

  function startAssembly() {
    clearTimeout(assemblyTimer);
    const use3d = !!case3d;
    $('caseBox').classList.toggle('is-3d', use3d);
    setAssembled(false);
    if (use3d) {
      case3d.attach($('case3d'), 'stage'); // модель переезжает из карточки на экран 3
      case3d.highlight(state.hl);
      case3d.replay(); // конец сборки придёт через onAssembled
      return;
    }
    $('caseSvg').classList.remove('skip');
    const parts = $('caseParts');
    parts.replaceWith(parts.cloneNode(true)); // новый узел — CSS-анимации начинаются заново
    assemblyTimer = setTimeout(() => setAssembled(true), ASSEMBLY_MS);
  }

  function skipAssembly() {
    if (state.assembled) return;
    if (using3d() && case3d) {
      case3d.skip();
      return;
    }
    clearTimeout(assemblyTimer);
    $('caseSvg').classList.add('skip');
    setAssembled(true);
  }

  function setAssembled(done) {
    state.assembled = done;
    $('caseState').textContent = done ? 'СОБРАН · ПОДСВЕТКА' : 'СОБИРАЕМ';
    $('caseHint').textContent = done ? 'потяни — повернуть' : 'тап — пропустить';
    $('caseHint').hidden = done && !using3d();
  }

  /* ---------- 3D-корпус ---------- */

  let caseMode = 'svg'; // выбирается в init()
  let case3d = null;
  let case3dLoading = false;

  // three.js 0.163+ работает только на WebGL2; import map нужна для локальных модулей.
  function supports3d() {
    if (!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'))) return false;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (e) {
      return false;
    }
  }

  function pickCaseMode() {
    const forced = new URLSearchParams(location.search).get('case');
    if (forced === 'svg') return 'svg';
    if (forced === '3d') return supports3d() ? '3d' : 'svg';
    try {
      if (localStorage.getItem(CASE_STORAGE_KEY) === 'svg') return 'svg';
    } catch (e) { /* хранилище недоступно */ }
    return DEFAULT_CASE === '3d' && supports3d() ? '3d' : 'svg';
  }

  // 3D в карточке: плавно проявляется поверх рисованного корпуса.
  function showCard3d(on) {
    const holder = $('card3d');
    if (!holder) return;
    holder.classList.toggle('on', on);
    holder.parentNode.classList.toggle('is-3d', on);
  }

  function preload3d() {
    if (caseMode !== '3d' || case3d || case3dLoading) return;
    case3dLoading = true;
    const card = $('card3d');
    import('./case3d.js')
      .then(m => m.createCase3D(card || $('case3d'), card ? 'card' : 'stage', {
        onAssembled: () => setAssembled(true),
        onSlow: () => fallbackToSvg(true),
        onFail: () => fallbackToSvg(false)
      }))
      .then(c => {
        case3d = c;
        if (card) showCard3d(true);
      })
      .catch(err => {
        console.warn('3D-корпус не загрузился, остаётся рисованный', err);
        caseMode = 'svg';
      })
      .then(() => { case3dLoading = false; });
  }

  // Телефон не тянет 3D — показываем рисованный корпус и запоминаем это на устройстве.
  function fallbackToSvg(remember) {
    if (remember) {
      try { localStorage.setItem(CASE_STORAGE_KEY, 'svg'); } catch (e) { /* хранилище недоступно */ }
    }
    caseMode = 'svg';
    const wasActive = using3d();
    if (case3d) {
      const c = case3d;
      case3d = null;
      c.dispose();
    }
    showCard3d(false);
    $('caseBox').classList.remove('is-3d');
    if (wasActive) {
      $('caseSvg').classList.add('skip');
      setAssembled(true);
      drawHighlight();
    }
  }

  /* ---------- Навигация ---------- */

  const SCREENS = ['catalog', 'games', 'result', 'build'];

  function show(name) {
    if (state.screen === name) return;
    const forward = SCREENS.indexOf(name) > SCREENS.indexOf(state.screen);
    state.screen = name;
    document.querySelectorAll('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
    if (forward) document.querySelector('.screen[data-screen="' + name + '"] .scroll').scrollTop = 0;
    tgCall('6.1', t => (name === 'catalog' ? t.BackButton.hide() : t.BackButton.show()));
    if (name === 'build') startAssembly();
    if (name === 'catalog' && case3d && $('card3d')) case3d.attach($('card3d'), 'card'); // модель возвращается в карточку
  }

  function goBack() {
    const i = SCREENS.indexOf(state.screen);
    if (i > 0) show(SCREENS[i - 1]);
  }

  /* ---------- Заказ ---------- */

  function orderUrl() {
    const b = currentBuild();
    const g = currentGame();
    const text =
      'Здравствуйте, интересует сборка «' + b.name + '».\n' +
      'Смотрел FPS в ' + g.name + ', ' + state.res + ', ' + state.q + '. [' + state.source + ']';
    return ORDER_CHAT + '?text=' + encodeURIComponent(text);
  }

  function onOrder(e) {
    const url = orderUrl();
    this.href = url; // вне Telegram ссылка откроется сама
    if (inTelegram && tg.isVersionAtLeast('6.1')) {
      e.preventDefault();
      tg.openTelegramLink(url);
    }
  }

  /* ---------- Запуск ---------- */

  function init() {
    if (!BUILDS.length || !GAMES.length) {
      document.body.textContent = 'Нет данных: проверьте js/builds.js и js/games.js';
      return;
    }

    if (inTelegram) document.documentElement.classList.add('tg');
    tgCall(null, t => { t.ready(); t.expand(); });
    // Фиксированная чёрная схема — шапку и фон Telegram красим в свой цвет.
    tgCall('6.1', t => { t.setHeaderColor('#0A0A0A'); t.setBackgroundColor('#0A0A0A'); });
    tgCall('7.10', t => t.setBottomBarColor('#0A0A0A'));
    // Чтобы прокрутка экрана 3 вниз не сворачивала приложение.
    tgCall('7.7', t => t.disableVerticalSwipes());
    tgCall('6.1', t => t.BackButton.onClick(goBack));

    caseMode = pickCaseMode();
    const holder = el('div', 'case3d');
    holder.id = 'case3d';
    $('caseBox').insertBefore(holder, $('caseHint'));

    renderCards();
    renderTiles();
    renderSeg('resSeg', RESOLUTIONS, 'res');
    renderSeg('qSeg', QUALITIES, 'q');
    renderRail();
    renderBuild();

    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goBack));
    $('toBuild').addEventListener('click', () => show('build'));
    $('caseBox').addEventListener('click', skipAssembly);
    $('replay').addEventListener('click', e => {
      e.stopPropagation();
      state.hl = null;
      syncPressed($('parts'), null);
      drawHighlight();
      startAssembly();
    });
    document.querySelectorAll('.order').forEach(a => a.addEventListener('click', onOrder));

    preload3d(); // 3D нужен уже в первой карточке каталога
  }

  init();
})();
