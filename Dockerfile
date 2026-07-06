# syntax=docker/dockerfile:1

# ---- base ----
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---- deps: full install (incl. devDeps for build/worker/migrations) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ---- build: compile the Next.js standalone bundle ----
FROM deps AS build
COPY . .
# A dummy DATABASE_URL keeps db/index.ts from throwing at import during build;
# no DB connection is made (postgres-js connects lazily).
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgres://build:build@localhost:5432/build"
RUN npm run build

# ---- web: slim production runtime (standalone server) ----
FROM base AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

# ---- runtime: full deps + source, for the worker and DB migrations ----
# Runs TypeScript directly via tsx and has drizzle-kit available. The concrete
# command (worker vs migrate) is supplied by docker-compose.
FROM deps AS runtime
COPY . .
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/worker/index.ts"]
