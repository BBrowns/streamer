FROM node:24-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --workspace=server --workspace=packages/shared

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

FROM node:24-alpine AS production
WORKDIR /app
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
