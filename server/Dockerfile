FROM node:24-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY packages/shared/package.json ./packages/shared/

# Keep container installs aligned with the repository lockfile/toolchain. Root
# lifecycle scripts target the full desktop/mobile workspace and are not needed
# for this server-only image; Prisma generation runs explicitly below.
RUN npx --yes npm@11.18.0 ci --ignore-scripts --no-audit --no-fund \
    --workspace=server --workspace=packages/shared

# Copy source
COPY packages/shared/ ./packages/shared/
COPY server/ ./server/

# Generate Prisma client
RUN npx prisma generate --schema=./server/prisma/schema.prisma

# Dev target
FROM base AS dev
WORKDIR /app
CMD ["npm", "run", "dev", "--workspace=server"]

# Production build
FROM base AS build
WORKDIR /app
RUN npm run build --workspace=server
RUN npx --yes npm@11.18.0 prune --omit=dev --ignore-scripts \
    --workspace=server --workspace=packages/shared

FROM node:24-alpine AS production
WORKDIR /app
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/live" >/dev/null || exit 1
USER node
CMD ["node", "server/dist/index.js"]
