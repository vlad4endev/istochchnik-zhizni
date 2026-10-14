# Docker Compose — какой файл для чего

Базовый стек: `docker-compose.yml` (**api + web**, без локального `db` — БД обычно Supabase или отдельный Postgres).

| Файл | Назначение |
|------|------------|
| `docker-compose.yml` | api + web |
| `docker-compose.local.yml` | проброс порта Postgres (ожидает сервис `db` из prod-файла) |
| `docker-compose.prod.yml` | VPS: db + api |
| `docker-compose.prod.overlay.yml` | overlay для prod (API на loopback) |
| `docker-compose.redis-addon.yml` | optional Redis fanout |
| `docker-compose.livekit-addon.yml` | LiveKit SFU |
| `docker-compose.web-prebuilt.yml` | nginx из `release/web/` |
| `docker-compose.web-split.yml` | Main + Studio фронты |
| `docker-compose.portainer.yml` | Portainer api-only |
| `docker-compose.portainer.stack.yml` | Portainer api + web |
| `docker-compose.portainer.web-runtime.yml` | nginx + bind-mount dist |

Типичные команды — см. корневой `README.md` (`prod:start`, `prod:deploy`, `db:up`).
