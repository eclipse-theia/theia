# QAAP on a VPS (Hetzner and similar)

Deploy the browser IDE with **QAIQ** (`@qaiq`) as the default background coding agent on a
single Docker host (Hetzner CX/CPX, Contabo, etc.).

## Requirements

- Ubuntu 22.04+ (or Debian bookworm) on the VPS
- Docker Engine + Docker Compose v2
- At least **4 GB RAM** for the container (`docker-compose.yml` limit); **8 GB** recommended if
  you run heavy `@qaiq` jobs on large repos
- One **provider API key** (OpenRouter, Gemini, NVIDIA NIM, OpenAI, Anthropic, or Ollama on
  the host)

## Quick start

On the VPS:

```bash
sudo apt-get update && sudo apt-get install -y git docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"   # re-login once

git clone https://github.com/juancristobalgd1/qaap.git /opt/qaap
cd /opt/qaap
cp .env.docker.example .env
```

Edit `.env`:

| Variable | Example | Purpose |
|----------|---------|---------|
| `THEIA_PORT` | `4873` | Port published to the internet |
| `QAAP_OAUTH_PUBLIC_URL` | `http://203.0.113.10:4873` | Public URL (OAuth + dev preview) |
| `QAAP_GITHUB_CLIENT_ID` / `SECRET` | from GitHub OAuth app | Login (or `QAAP_SKIP_AUTH=true` for private labs) |
| `OPENROUTER_API_KEY` | `sk-or-…` | Powers `@qaiq` when no model is set in Settings |
| `QAAP_DEFAULT_AGENT` | `qaiq` | Default agent (already the image default) |
| `CODEX_CLI_VERSION` | `latest` | Codex CLI version installed during Docker build |
| `CLAUDE_CODE_VERSION` | `latest` | Claude Code CLI version installed during Docker build |
| `ANTIGRAVITY_CLI_VERSION` | `latest` | Antigravity CLI version installed during Docker build |
| `OPENCODE_CLI_VERSION` | `latest` | OpenCode CLI (`opencode-ai`) installed during Docker build |
| `COPILOT_CLI_VERSION` | `latest` | GitHub Copilot CLI (`@github/copilot`) installed during Docker build |

Open the firewall port (example with UFW):

```bash
sudo ufw allow 4873/tcp
sudo ufw enable
```

Build and run:

```bash
docker compose up --build -d
docker compose logs -f theia   # wait for "Configuration directory URI"
```

Open `http://<your-vps-ip>:4873`.

## What the image includes

The runtime stage of `Dockerfile` installs:

- **QAIQ** → `/usr/local/bin/qaiq` (built from `github.com/juancristobalgd1/qaiq`)
- **Codex CLI** → `codex` (`@openai/codex`)
- **Claude Code** → `claude` (`@anthropic-ai/claude-code`)
- **Antigravity CLI** → `antigravity` (installed from `@sanchaymittal/antigravity-cli` with `antigravity` alias)
- **OpenCode** → `opencode` (`opencode-ai`)
- **GitHub Copilot CLI** → `copilot` (`@github/copilot`)
- **Aider** → `~/.local/bin/aider`
- `git`, `curl`, `bun`, `pnpm`, `yarn`, `build-essential`, `ripgrep` for agent shell work

At container start, the backend logs detected agents, for example:

```text
[qaap-agent-tasks] detected agents: qaiq, aider
[qaap-agent-tasks] qaiq: 0.15.0-qaap.1 (QAIQ)
```

## API keys: `.env` vs Settings → AI

Background jobs read credentials in this order:

1. **Environment variables** in `.env` / `docker-compose` (recommended on VPS)
2. **Theia user preferences** under `/root/.theia` (persisted via volume `qaap-theia-user`)

Set at least one key in `.env` before relying on `@qaiq`. Without a key, task creation fails
with a clear error instead of hanging on Anthropic OAuth.

OpenRouter example in `.env`:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Gemini:

```bash
GEMINI_API_KEY=...
```

## Using `@qaiq` on the VPS

1. Open or clone a project into `/workspace` (default Docker volume).
2. In chat: `@qaiq Explain what this repo does using README and package.json only. Do not run tests.`
3. Track long jobs under **Jobs / Background tasks**.

Tips:

- Prefer **read-only prompts** for questions; avoid `npm test` unless you need it (failed tests
  trigger QAIQ’s “repeated tool failures” guard after three Bash errors).
- For Theia monorepos: run `npm run compile` before `npm test`.
- QAIQ in the container uses `--dangerously-skip-permissions` (single-tenant VPS).

## Ollama on the host

If Ollama runs on the VPS **outside** Docker, point the container at the host gateway:

```bash
# Linux (Docker 20.10+)
OLLAMA_HOST=http://host.docker.internal:11434
```

Add to `docker-compose.yml` under `theia`:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

## Verify agent CLIs inside the running container

```bash
docker compose exec theia qaiq --version
docker compose exec theia codex --version
docker compose exec theia claude --version
docker compose exec theia antigravity --version
docker compose exec theia opencode --version
docker compose exec theia copilot --version
docker compose exec theia which qaiq aider codex claude antigravity opencode copilot
docker compose logs theia 2>&1 | grep 'qaap-agent-tasks'
```

## Build args (optional)

Pin the QAIQ fork revision:

```bash
docker compose build --build-arg QAIQ_REF=v0.15.0-qaap.1
```

Pin agent CLI versions, or leave them as `latest` in `.env` to resolve current releases on a
fresh VPS build:

```bash
CODEX_CLI_VERSION=0.135.0
CLAUDE_CODE_VERSION=2.1.159
ANTIGRAVITY_CLI_VERSION=latest
```

If you are rebuilding an existing VPS image and want Docker to re-resolve `latest`, rebuild
without cache:

```bash
docker compose build --no-cache theia
docker compose up -d
```

## HTTPS (recommended for production)

Put **Caddy** or **nginx** in front with TLS and set `QAAP_OAUTH_PUBLIC_URL` to
`https://ide.example.com`. Update the GitHub OAuth callback URL to match.

## Related docs

- [qaap-background-agents.md](./qaap-background-agents.md) — agent templates, `QAAP_AGENT_COMMANDS`, custom providers
