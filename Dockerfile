# Multi-stage: deps → build (tsc) → prod-deps → runtime (только dist + production node_modules)
FROM public.ecr.aws/docker/library/node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && test -f dist/config/initDb.js

FROM public.ecr.aws/docker/library/node:20-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM public.ecr.aws/docker/library/node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=40978
# Каталог снимков внутри контейнера (монтируйте том, иначе пропадут при recreate)
ENV BACKUP_DIR=/app/backups

# bash + pg_dump/pg_restore — нужны для scripts/backup.sh и scripts/restore.sh из админки
RUN apk add --no-cache curl su-exec ffmpeg bash openssl tar gzip util-linux && \
  (apk add --no-cache postgresql16-client || apk add --no-cache postgresql-client) && \
  addgroup -g 1001 -S app && adduser -S app -u 1001 -G app && \
  command -v pg_dump && command -v bash

COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY supabase/migrations ./supabase/migrations
# Скрипты полного бекапа/восстановления (Админка → Резервная копия)
COPY scripts/backup.sh scripts/restore.sh ./scripts/
COPY scripts/lib ./scripts/lib
RUN chmod +x ./scripts/backup.sh ./scripts/restore.sh && \
  test -f ./scripts/lib/backup-common.sh

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
  test -s /usr/local/bin/docker-entrypoint.sh && \
  head -1 /usr/local/bin/docker-entrypoint.sh | grep -q '^#!/bin/sh'

RUN mkdir -p /app/backups /app/uploads /app/secrets && chown -R app:app /app

EXPOSE 40978

# PORT подставляется в runtime (например, Railway); shell-форма для подстановки $PORT
HEALTHCHECK --interval=20s --timeout=5s --start-period=50s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

USER root
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
