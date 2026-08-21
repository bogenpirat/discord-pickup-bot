FROM node:26.5.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26.5.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:26.5.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only /data needs to be writable by the app; /app stays root-owned and
# world-readable. A recursive chown over node_modules would copy every file
# into a fresh layer, costing ~20s of build time and duplicating the tree.
RUN mkdir -p /data && chown node:node /data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY docker/healthcheck.mjs ./healthcheck.mjs

USER node

# Documentation only; the actual port comes from HTTP_PORT at runtime.
EXPOSE 18080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "/app/healthcheck.mjs"]

CMD ["node", "dist/index.js"]
