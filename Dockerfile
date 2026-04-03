# Multi-stage: deps → build (tsc) → prod-deps → runtime (только dist + production node_modules)
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && test -f dist/config/initDb.js

FROM node:20-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=40978

RUN apk add --no-cache curl su-exec && \
  addgroup -g 1001 -S app && adduser -S app -u 1001 -G app

COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
  test -s /usr/local/bin/docker-entrypoint.sh && \
  head -1 /usr/local/bin/docker-entrypoint.sh | grep -q '^#!/bin/sh'

RUN chown -R app:app /app

EXPOSE 40978

# PORT подставляется в runtime (например, Railway); shell-форма для подстановки $PORT
HEALTHCHECK --interval=20s --timeout=5s --start-period=50s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

USER root
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
