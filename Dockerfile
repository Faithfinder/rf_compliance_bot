FROM oven/bun:1.2.23-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

RUN mkdir -p /app/data && chown -R bun:bun /app/data

VOLUME ["/app/data"]

USER bun
EXPOSE 3000

ENV NODE_ENV=production

CMD ["bun", "run", "start"]
