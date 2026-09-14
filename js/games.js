// Игры и FPS для экрана результата.
//
// base — средний FPS на эталонной сборке «Первая кровь» (RTX 5060 8GB, gpuIndex 100):
//        1080p, высокие настройки, без DLSS и без трассировки лучей.
// cap  — потолок по процессору Ryzen 5 5600: выше не будет даже на низких настройках.
// tile — подпись на плитке, если нужен перенос строки. Необязательно.
//
// Игра с base: null в приложении не показывается — надёжных тестов нет.
// Появится замер — впишите base и cap, плитка появится сама.
//
// Порядок в массиве = порядок плиток, от лёгких к тяжёлым.
// Источники собраны 14.09.2026. Цифры из видео прочитаны с оверлея:
// AVG — среднее за всю сессию, кадр в конце ролика.

window.SHRAM_GAMES = [
  {
    id: 'cs2',
    name: 'CS2',
    // base 280 — TechPowerUp, обзор Zotac RTX 5060 Solo, 1920×1080, максимальные настройки,
    //   без апскейла и RT, стенд Ryzen 7 9800X3D: 279,0 FPS.
    //   https://www.techpowerup.com/review/zotac-geforce-rtx-5060-solo-8-gb/12.html
    //   Сверка: X-Com (Хабр), Very High, 9800X3D: 292.  https://habr.com/ru/articles/921248
    base: 280,
    // cap 400 — Neo channel, Ryzen 5 5600 + RTX 5080, 1080p Very High: 410 avg
    //   (итоговый экран на 4:22).  https://www.youtube.com/watch?v=RZTQx13cPm8
    //   Сверка: TechSpot, Ryzen 7 5700X + RTX 4090, 1080p Medium: 403.
    //   https://www.techspot.com/bestof/cpu-value-24-25/
    //   В живом онлайн-матче меньше: ByArdanTR, 5600X + 5060 + 16 ГБ, 1080p Low: 323.
    //   https://www.youtube.com/watch?v=HE4Pi8cOR0o
    cap: 400
  },
  {
    id: 'dota',
    name: 'Dota 2',
    // base 220 — X-Com (Хабр), RTX 5060, максимальные настройки, Ryzen 7 9800X3D: 222.
    //   Единственный найденный тест 5060 в Доте.  https://habr.com/ru/articles/921248
    base: 220,
    // cap 165 — ByArdanTR, Ryzen 5 5600X + RTX 5060 + 16 ГБ DDR4-3600, 1080p Ultra, матч:
    //   166 avg при загрузке видеокарты 68%, то есть упор в процессор.
    //   5600 примерно на 4% медленнее 5600X (по тесту Neo channel).
    //   https://www.youtube.com/watch?v=5yM9QHiSWJ8
    cap: 165
  },
  {
    id: 'gta',
    name: 'GTA V',
    // Нет надёжных данных. Все найденные тесты RTX 5060 — с трассировкой, DLSS или модами:
    //   GameGPU — только Max RT; ByArdanTR — RT ON; Easy Benchmark — 1440p, RT и DLSS;
    //   X-Com — с модом NaturalVision.
    // PC Support & Gaming Test (5600 + 5060, 32 ГБ) показывает 121–141 avg, но без настроек.
    // Не выбрано, какая версия нужна: Legacy или Enhanced.
    base: null,
    cap: null
  },
  {
    id: 'pubg',
    name: 'PUBG',
    // base 165 — ByArdanTR, Ryzen 5 5600X + RTX 5060 + 16 ГБ DDR4-3600, 1080p Ultra, матч:
    //   133 avg, видеокарта загружена на 96%. Замер сделан на ультра, поэтому
    //   base = 133 / 0,8 ≈ 165 — на «ультра» приложение покажет ровно замер.
    //   https://www.youtube.com/watch?v=u97CulbUdBw
    base: 165,
    // cap 195 — тот же стенд, 1080p Very Low: 198 avg, видеокарта 80%.
    //   https://www.youtube.com/watch?v=E_8I0ZwzCwI
    cap: 195
  },
  {
    id: 'tarkov',
    name: 'Escape from Tarkov',
    tile: 'Escape from\nTarkov',
    // Нет надёжных данных. Единственный тест RTX 5060 (Games Hub Benchmarks) — на
    //   Ryzen 7 5800X3D и 32 ГБ, до версии 1.0: для 5600 и 16 ГБ цифры были бы завышены.
    //   https://www.youtube.com/watch?v=BvG6HJ1GV7c
    // Тест RTX 4060 + 5600X + 16 ГБ — версия 0.14, 2024 год.
    // Нужен замер на своей сборке: Таможня и Улицы, 1080p, высокие, 16 ГБ.
    base: null,
    cap: null
  },
  {
    id: 'cp',
    name: 'Cyberpunk 2077',
    tile: 'Cyberpunk\n2077',
    // base 100 — TechSpot (Hardware Unboxed), обзор RTX 5060, Phantom Liberty, 1080p High,
    //   без апскейла и RT, Ryzen 7 9800X3D: 100 avg, 1% low 81.
    //   https://www.techspot.com/review/2992-nvidia-geforce-rtx-5060/
    //   Сверка: TechPowerUp, максимальные настройки: 102,2.
    //   https://www.techpowerup.com/review/msi-geforce-rtx-5060-gaming-oc/13.html
    base: 100,
    // cap 125 — TechSpot, Ryzen 7 5700X + RTX 4090, 1080p High: 126 avg.
    //   Сам 5600 там не тестировали; у него на 2 ядра меньше, потолок может быть чуть ниже.
    //   https://www.techspot.com/bestof/cpu-value-24-25/
    cap: 125
  }
];
