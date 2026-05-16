# Multi-stage image for the browser example (frontend + Node backend).
# Works on Railway, Fly.io, Hetzner, or any host with Docker.

# --- Build -------------------------------------------------------------------
FROM node:22-bookworm AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    ca-certificates \
    pkg-config \
    libx11-dev \
    libxkbfile-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json lerna.json ./
COPY configs ./configs
COPY scripts ./scripts
COPY dev-packages ./dev-packages
COPY packages ./packages
COPY examples ./examples
COPY sample-plugins ./sample-plugins

ENV NODE_OPTIONS=--max_old_space_size=4096

RUN npm ci

# @theia/cli bin/theia.js requires ../lib/theia (built by compile)
RUN npm run compile

RUN npm run download:plugins -- --rate-limit 5

WORKDIR /app/examples/browser
RUN npm run build:production

# --- Runtime -----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/examples/browser

COPY --from=build /app /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    THEIA_PLUGINS_DIR=/app/plugins

EXPOSE 3000

VOLUME ["/workspace"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD node -e "const p=process.env.PORT||3000;require('http').get('http://127.0.0.1:'+p+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "exec node src-gen/backend/main.js /workspace \
    --hostname=${HOST} \
    --port=${PORT} \
    --no-cluster \
    --plugins=local-dir:${THEIA_PLUGINS_DIR} \
    --ovsx-router-config=/app/examples/ovsx-router-config.json"]
