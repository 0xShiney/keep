# Keep web (Next.js standalone). Build context is the repository root.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env: keep placeholders so `next build` never needs real secrets.
ENV SESSION_SECRET=build-time-placeholder-not-used-at-runtime-32chars
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 keep && adduser -S -u 1001 -G keep keep

COPY --from=build --chown=keep:keep /app/.next/standalone ./
COPY --from=build --chown=keep:keep /app/.next/static ./.next/static
COPY --from=build --chown=keep:keep /app/public ./public
COPY --from=build --chown=keep:keep /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=keep:keep /app/db/migrations ./db/migrations
COPY --chown=keep:keep deploy/web/entrypoint.sh ./entrypoint.sh

USER keep
EXPOSE 3000
ENTRYPOINT ["/bin/sh", "./entrypoint.sh"]
