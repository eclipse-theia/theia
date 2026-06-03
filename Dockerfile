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

RUN npm run download:plugins -- --rate-limit 5 --ignore-errors

WORKDIR /app/examples/browser
RUN npm run build:production && node scripts/copy-frontend-static.mjs

# --- Runtime -----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# QAIQ ref pinned at build time; override: docker build --build-arg QAIQ_REF=v0.15.0-qaap.1
ARG QAIQ_REPO=https://github.com/juancristobalgd1/qaiq.git
ARG QAIQ_REF=main
ARG CODEX_CLI_VERSION=latest
ARG CLAUDE_CODE_VERSION=latest
ARG ANTIGRAVITY_CLI_VERSION=latest
ARG OPENCODE_CLI_VERSION=latest
ARG COPILOT_CLI_VERSION=latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    python3 \
    pipx \
    build-essential \
    ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10 --activate \
    && corepack prepare yarn@stable --activate \
    && npm install -g \
        @openai/codex@"${CODEX_CLI_VERSION}" \
        @anthropic-ai/claude-code@"${CLAUDE_CODE_VERSION}" \
        @sanchaymittal/antigravity-cli@"${ANTIGRAVITY_CLI_VERSION}" \
        opencode-ai@"${OPENCODE_CLI_VERSION}" \
        @github/copilot@"${COPILOT_CLI_VERSION}" \
    && npm install -g bun \
    && codex --version \
    && claude --version \
    && opencode --version \
    && copilot --version \
    && ln -sf "$(command -v ag)" /usr/local/bin/antigravity \
    && antigravity --version \
    && git clone --depth 1 --branch "${QAIQ_REF}" "${QAIQ_REPO}" /opt/qaiq \
    && cd /opt/qaiq && bun install && bun run build \
    && ln -sf /opt/qaiq/bin/qaiq /usr/local/bin/qaiq \
    && qaiq --version \
    && pipx install aider-chat \
    && /root/.local/bin/aider --version

ENV PATH="/root/.local/bin:${PATH}" \
    QAAP_DEFAULT_AGENT=qaiq

WORKDIR /app/examples/browser

COPY --from=build /app /app

ARG QAAP_IDE_PORT=4873
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=${QAAP_IDE_PORT} \
    THEIA_PLUGINS_DIR=/app/plugins

EXPOSE ${QAAP_IDE_PORT}

VOLUME ["/workspace"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD node -e "const p=process.env.PORT||4873;require('http').get('http://127.0.0.1:'+p+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "exec node src-gen/backend/main.js /workspace \
    --hostname=${HOST} \
    --port=${PORT} \
    --no-cluster \
    --plugins=local-dir:${THEIA_PLUGINS_DIR} \
    --ovsx-router-config=/app/examples/ovsx-router-config.json"]
