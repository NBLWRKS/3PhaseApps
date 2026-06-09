# ---------- Stage 1: build the React client ----------
FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- Stage 2: install server deps (compiles better-sqlite3) ----------
FROM node:20-bookworm-slim AS server-build
# Build tools needed to compile better-sqlite3's native addon.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --no-audit --no-fund --omit=dev

# ---------- Stage 3: runtime ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
# Server code + compiled node_modules
COPY --from=server-build /app/server/node_modules ./node_modules
COPY server/ ./
# Built frontend goes where index.js looks for it: ../../client-dist relative to src/
COPY --from=client-build /app/client/dist /app/client-dist

# data and uploads are mounted as volumes in compose
RUN mkdir -p /app/server/data /app/server/uploads

EXPOSE 8080
CMD ["node", "src/index.js"]
