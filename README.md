# YupDar

Telegram Mini App вокруг авторской системы «81 Дар». Расчёт персонального Дара по дате рождения, AI-послания, Оракул, игры, энциклопедия и книги.

- Боевой сайт: https://yupdar.com
- Бот: @YupDarBot

## Новому разработчику

Полное техническое задание и видение проекта — в файле **[HANDOFF.md](HANDOFF.md)**. Там описаны стек, архитектура, все API-эндпоинты, база данных, фичи, дорожная карта, законы проекта и технический долг.

## Стек

Node.js 20, Express 5, Supabase (PostgreSQL), ванильный фронтенд (HTML/CSS/JS), AI через DeepSeek + Groq, деплой в Docker.

## Локальный запуск

1. Скопируй `.env.production.example` в `.env.production` и заполни значения (секреты передаются отдельно, не в репозитории).
2. Установи зависимости: `npm ci` в корне и `cd public && npm ci`.
3. Запусти: `npm start` (сервер на порту 3000).

## Деплой

Автоматический: push в `main` → GitHub Actions заходит по SSH на сервер, делает `git pull` и пересборку `docker compose -f docker-compose.yupdar.yml`. Подробности в `.github/workflows/deploy.yml`.

На каждый деплой с изменением фронтенда — бампить cache-bust токен (`public/version.txt` + `?v=` в `public/index.html`). См. раздел 10 в HANDOFF.md.
