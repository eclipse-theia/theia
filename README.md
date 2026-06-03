# QAAP

QAAP is an agentic cloud IDE built on Eclipse Theia. It turns a browser or
desktop workspace into a place where coding agents can run real tasks, keep
working in the background, report progress, and hand changes back for review.

The product focus is simple: open a project, delegate work to an agent, review
the diff, run verification, and keep moving from desktop or mobile.

## What QAAP Adds

- **Background coding agents** that keep running in the server process after the
  browser tab closes.
- **Multi-agent Work Hub** for active conversations, tasks, approvals, pull
  requests, routines, and project-level follow-up.
- **Mobile-first execution view** with chat, plan/activity, changes, preview,
  files, terminal, and verification surfaces.
- **BYOK/provider support** through QAIQ, OpenRouter, NVIDIA, Ollama, Gemini,
  OpenAI-compatible endpoints, and other CLI-backed agents.
- **Cloud workspace tooling** for Docker/VPS deployment, persistent Theia user
  state, preview sharing, terminal persistence, and push notifications.
- **Controlled Theia fork drift**: product code lives under `packages/qaap-*`;
  intentional upstream seams are guarded by `npm run qaap:drift-check`.

## Agent Runtime

QAAP can detect and run several CLI agents on the backend:

- `qaiq`
- `codex`
- `claude`
- `aider`
- `opencode`
- `goose`
- `hermes`
- `cursor-agent`
- `antigravity` / `agy`
- `copilot`
- `qwen`
- `kimi`

QAIQ is the default low-friction path for BYOK/free-tier usage. See
[doc/qaap-background-agents.md](doc/qaap-background-agents.md) for command
templates, environment variables, and custom agent configuration.

## Repository Layout

```text
packages/
  qaap-product/            product umbrella, branding, preload, Electron hooks
  qaap-cloud-workspace/    background agents, conversations, tasks, deploy APIs
  qaap-mobile-shell/       Work Hub, mobile shell, execution surfaces
  qaap-adapters/           Theia seams and browser/preview adapters
  qaap-ai-config/          AI defaults, prompts, model wiring
  qaap-ai-openrouter/      OpenRouter preferences and model catalog
  qaap-ai-nvidia/          NVIDIA preferences and model catalog
  qaap-shell/              shell/layout overrides
  qaap-product-theme/      product CSS and theme tokens
  qaap-element-inspector/  preview element inspector
qaiq/                      QAAP's bundled/forked agent CLI
doc/                       architecture, deployment, agent docs, mockups
```

## Run From Source

Prerequisites:

- Node.js 22 or newer
- npm
- native build tools for Theia dependencies

Install and build:

```bash
npm install
npm run build:browser
```

Start the browser IDE:

```bash
npm run start:browser
```

Useful checks:

```bash
npm run qaap:drift-check
npm --prefix packages/qaap-cloud-workspace test
npm --prefix packages/qaap-mobile-shell test
```

## Docker / VPS

For a production-style browser IDE with persistent volumes and server-side
agents, use the deployment guide:

[doc/qaap-vps-deployment.md](doc/qaap-vps-deployment.md)

## Architecture Notes

QAAP is intentionally a product fork, but it avoids burying product behavior in
upstream Theia packages. The target architecture is:

- product behavior in `packages/qaap-*`
- narrow adapter seams where Theia needs to be re-bound or extended
- explicit drift checks against `upstream/master`

See [doc/qaap-architecture-audit.md](doc/qaap-architecture-audit.md) for the
current seam inventory and migration history.

## License

This repository inherits the Eclipse Theia licensing model:

- [Eclipse Public License 2.0](LICENSE-EPL)
- [GNU General Public License v2 with Classpath Exception](LICENSE-GPL-2.0-ONLY-CLASSPATH-EXCEPTION)
