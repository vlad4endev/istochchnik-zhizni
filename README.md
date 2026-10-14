<p align="center">
  <img src="web-react/public/assets/logo.svg" alt="Источник жизни" width="96" height="96" />
</p>

<h1 align="center">Источник жизни</h1>

<p align="center">
  <strong>Цифровая платформа для церковной общины</strong><br />
  Молитва · Песни · Мессенджер · Расписание · Медиа · Звонки — в одном продукте
</p>

<p align="center">
  <a href="https://istochchnik-zhizni.vercel.app"><img src="https://img.shields.io/badge/Demo-Открыть_сайт-8C2C3F?style=for-the-badge" alt="Demo" /></a>
  &nbsp;
  <a href="#быстрый-старт"><img src="https://img.shields.io/badge/Старт-5_минут-C1684B?style=for-the-badge" alt="Quick start" /></a>
  &nbsp;
  <a href="docs/operations.md"><img src="https://img.shields.io/badge/Docs-Операции-5C1325?style=for-the-badge" alt="Docs" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Express-API-000000?logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Vite-PWA-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/LiveKit-Calls-1FA2FF?logo=livekit&logoColor=white" alt="LiveKit" />
</p>

---

## Зачем это

Общинам обычно не хватает одной системы: чаты — в одном месте, песни — в другом, расписание — в таблицах, медиа — на третьем сервисе. **Источник жизни** собирает повседневную жизнь церкви в единый современный продукт: понятный для прихожан, мощный для служителей и админов.

| Боль сегодня | Что даёт платформа |
| --- | --- |
| Информация теряется между чатами и таблицами | Единая лента, уведомления и календарь |
| Служения собираются вручную | Планировщик служений, расписания, роли |
| Нет общего «дома» для контента | Песенник, медиа, проповеди, студия |
| Связь разрозненная | Мессенджер, push, звонки LiveKit |

---

## Возможности

<table>
<tr>
<td width="50%">

### 🙏 Молитва и община
Молитвенные нужды, публикации профиля, роли и безопасный доступ для членов церкви.

### 🎵 Песенник
Каталог песен, аккорды, транспозиция, импорт из PDF, сцена и студия для служения.

### 💬 Мессенджер
Чаты, медиа, push-уведомления — коммуникация внутри общины без сторонних приложений.

</td>
<td width="50%">

### 📅 Расписание и служения
Календарь, воскресные слоты, планировщик блоков служения, медиа- и музыкальные графики.

### 📡 Медиа и трансляции
Подкасты, видео, эфиры и контент-центр в одном маршруте.

### 📞 Звонки
Self-hosted LiveKit: аудио/видеозвонки с приглашениями и жизненным циклом на API.

</td>
</tr>
</table>

Также в продукте: **админ-панель**, аналитика, бэкапы, Telegram/SMS-интеграции, PWA и Android (Capacitor / React Native).

---

## Архитектура

```text
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Web / PWA / Mobile │────▶│  Express API (TS)   │────▶│  PostgreSQL         │
│  React · Vite · Cap │     │  Auth · Domains     │     │  (+ Supabase opt.)  │
└─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              LiveKit Calls      Web Push / FCM      Redis (opt.)
```

| Слой | Технологии | Где в репозитории |
| --- | --- | --- |
| **Frontend** | React, TypeScript, Vite, Mantine, PWA | `web-react/` |
| **API** | Express, TypeScript, PostgreSQL | `src/` |
| **Mobile** | Capacitor (PWA → APK), React Native | `web-react/`, `android-app/` |
| **Инфра** | Docker Compose, nginx, Supabase migrations | `docker-compose*.yml`, `supabase/` |

---

## Быстрый старт

### Вариант A — всё в Docker (рекомендуется)

```bash
cp .env.example .env          # или: npm run quickstart
docker compose up -d --build  # или: npm run prod:start
```

Откройте **[http://localhost:8080](http://localhost:8080)** — UI, API и health на одном origin.

### Вариант B — разработка в терминале

```bash
cp .env.local.example .env
# PostgreSQL: docker start istochnik-postgres
#   или: docker run -d --name istochnik-postgres \
#        -e POSTGRES_DB=istochik_db -e POSTGRES_USER=postgres \
#        -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine

npm ci
npx ts-node-dev --transpile-only --respawn src/main.ts   # API :40978
npm run web:dev                                          # Vite :5173
# или одной командой: npm run start-all
```

Vite проксирует `/api`, `/uploads` и `/health` на API — CORS в dev не нужен.

> Подробный деплой, Portainer, Supabase, VAPID, LiveKit и бэкапы: **[docs/operations.md](docs/operations.md)**.

---

## Структура репозитория

```text
istochchnik-zhizni/
├── src/                 # Express API (порт 40978)
├── web-react/           # React SPA + PWA + Capacitor
├── android-app/         # React Native (offline-first)
├── supabase/            # SQL-миграции
├── docs/                # Документация
├── scripts/             # Dev / deploy / backup
└── docker-compose*.yml  # Локальный и прод-стек
```

---

## Команды

| Задача | Команда |
| --- | --- |
| Dev: API + веб | `npm run start-all` / `npm run dev:start:fg` |
| Прод-стек | `npm run prod:start` |
| Статус / логи | `npm run prod:status` · `npm run prod:logs` |
| Обновление на VPS | `npm run server:update` |
| Бекап | `npm run backup` |
| Линт / тесты API | `npm run lint` · `npm test` |
| Сборка фронта | `npm run web:build` |
| Type-check API | `npx tsc --noEmit` |

---

## Документация

| Документ | О чём |
| --- | --- |
| [Операции и деплой](docs/operations.md) | Docker, VPS, Portainer, Supabase, push, LiveKit |
| [Бэкап и восстановление](docs/backup.md) | Полный снимок БД + uploads |
| [Звонки LiveKit](docs/calls-livekit.md) | Self-hosted звонки |
| [Схема БД](docs/db-schema.md) | Миграции и источники правды |
| [Логотипы и иконки](docs/logo-guidelines.md) | Визуальный стандарт |
| [Безопасность](SECURITY.md) | Аудит и рекомендации |

---

## Требования

- **Node.js 20+**
- **Docker** (для PostgreSQL и прод-стека)
- **npm** (lockfiles в корне и в `web-react/`)

Опционально: Redis, Supabase Storage, SMS.ru, Telegram, Firebase, LiveKit.

---

## Лицензия

Приватный проект общины. Использование и распространение — по согласованию с владельцами репозитория.

---

<p align="center">
  <sub>Сделано с заботой об общине · <a href="https://istochchnik-zhizni.vercel.app">istochchnik-zhizni.vercel.app</a></sub>
</p>
