FROM oven/bun:1.3.13-alpine AS builder
RUN addgroup -S node && adduser -S node -G node
WORKDIR /home/node
ENV NODE_ENV=build

COPY package*.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --chown=node:node . .
RUN bunx prisma generate \
  && bun run build \
  && bun install --production --frozen-lockfile

FROM oven/bun:1.3.13-alpine
RUN addgroup -S node && adduser -S node -G node
WORKDIR /home/node
ENV TZ=Asia/Bangkok

ARG ENV_FILE=local

COPY --from=builder --chown=node:node /home/node/package*.json ./
COPY --from=builder --chown=node:node /home/node/bun.lock ./
COPY --from=builder --chown=node:node /home/node/node_modules ./node_modules
COPY --from=builder --chown=node:node /home/node/dist ./dist
COPY deployment/environment/${ENV_FILE}.env ./.env

CMD ["bun", "run", "start:prod"]
