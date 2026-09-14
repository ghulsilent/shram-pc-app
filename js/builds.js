// Сборки. Одна сборка — ленты выбора нет. Две и больше — на экране результата
// появляется горизонтальная лента, переключение пересчитывает FPS на месте.
//
// gpuIndex — производительность видеокарты относительно RTX 5060 (= 100).
//            FPS «по видеокарте» = base игры × gpuIndex / 100.
// cpuCaps  — необязательно. Потолки по процессору, если в сборке не Ryzen 5 5600:
//            { cs2: 500, dota: 200, ... }. Для игр, которых здесь нет, берётся cap из games.js.
// parts    — ключи gpu, cpu, mb, ram, ssd, psu, cooler, chassis.
// image    — необязательно. Фото для карточки в каталоге, например 'img/first-blood.jpg'.
//            Без фото на карточке рисованный корпус.
//
// Каталог показывает 3 карточки: пока сборок меньше, остальные места — «скоро».

window.SHRAM_BUILDS = [
  {
    id: 'first-blood',
    name: 'Первая кровь',
    subtitle: '1080p, высокие настройки',
    price: 100000,
    stock: 3,
    warranty: '6 месяцев',
    gpuIndex: 100, // RTX 5060 = 100, для будущих сборок относительно неё
    parts: {
      gpu: 'Gigabyte RTX 5060 8GB',
      cpu: 'AMD Ryzen 5 5600',
      mb: 'B550M',
      ram: 'Kingston Fury DDR4 16 ГБ',
      ssd: 'Kingston NVMe 1 ТБ',
      psu: '1stPlayer PS-600FK, 600 Вт',
      cooler: 'Formula Ice Boid 4PSD12',
      chassis: 'Formula F-3401'
    }
  }
];
