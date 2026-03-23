FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=40978

COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 40978

CMD ["node", "dist/main.js"]
