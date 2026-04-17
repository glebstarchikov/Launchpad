# Stage 1: build
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN bun install --frozen-lockfile

COPY . .

RUN bun build client/src/main.tsx --outdir client/dist --minify
RUN cd client && bunx tailwindcss -i src/index.css -o dist/index.css --minify
COPY client/index.html client/dist/index.html

# Stage 2: runtime
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scripts ./scripts

VOLUME ["/data", "/uploads"]

ENV DATABASE_PATH=/data/launchpad.db
ENV UPLOADS_DIR=/uploads
ENV PORT=3001

EXPOSE 3001

CMD ["bun", "server/src/index.ts"]
