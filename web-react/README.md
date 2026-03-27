# React-интерфейс (Vite)

Экран **«Молитва дня»** — те же данные, что и у Flutter (`GET /api/calendar/:date`).

## Разработка

1. Поднимите API на `http://localhost:40978` (`npm run dev` в корне репозитория).
2. Здесь:
   ```bash
   npm install
   npm run dev
   ```
3. Откройте http://localhost:5173 — запросы к `/api` проксируются на бэкенд (см. `vite.config.ts`).

Другой URL API:

```bash
echo 'VITE_API_BASE_URL=http://127.0.0.1:40978' > .env
npm run dev
```

## Сборка

```bash
npm run build
```

Статика в `web-react/dist/` — можно отдавать nginx вместо Flutter `build/web`.

Из корня монорепозитория: `npm run web:build`.
