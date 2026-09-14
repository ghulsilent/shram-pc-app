# Shram PC — мини-приложение

Telegram Mini App для @shram_pc_bot: игра → FPS → железо → «Заказать».
Полностью статическое, без сервера и без внешних адресов.

## Файлы

| Путь | Что внутри |
|---|---|
| `index.html` | разметка трёх экранов |
| `css/app.css` | стили, анимации корпуса, подключение шрифтов |
| `js/builds.js` | сборки |
| `js/games.js` | игры, base и cap с источниками |
| `js/app.js` | формула, экраны, Telegram, текст заявки |
| `fonts/` | Oswald, IBM Plex Sans, IBM Plex Mono — кириллица и латиница |
| `vendor/telegram-web-app.js` | Telegram SDK, локальная копия |
| `design/` | выгрузки из Claude Design — лежат только локально, в репозиторий не входят |

## Добавить сборку

Дописать объект в `js/builds.js`. Когда сборок две и больше, на экране результата сама
появляется лента выбора. Если процессор не Ryzen 5 5600, укажите `cpuCaps` — иначе
потолки возьмутся из `games.js`.

## Добавить игру

Дописать объект в `js/games.js` с `base` и `cap` и комментарием, откуда цифры.
Игра с `base: null` не показывается.

## Проверить локально

```
python -m http.server 8765
```

Открыть `http://localhost:8765/?startapp=tiktok` — метка `tiktok` попадёт в текст заявки.
Вне Telegram нет вибрации, заявка открывается обычной ссылкой.

## Выложить

GitHub Pages: репозиторий → Settings → Pages → Deploy from a branch → `main`, папка `/ (root)`.
Cloudflare Pages: подключить репозиторий, команду сборки не указывать, папка вывода `/`.

## Привязать к боту

1. BotFather → `/newapp` → выбрать `@shram_pc_bot`.
2. Название, описание, картинка 640×360.
3. Адрес — ссылка с хостинга (https).
4. Короткое имя — `build`.
5. Проверить `t.me/shram_pc_bot/build` и `t.me/shram_pc_bot/build?startapp=tiktok`.
