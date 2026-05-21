# @theia/qaap-cloud-workspace

Cloud workspace for Qaap (browser/VPS + optional Electron dev containers).

## Docker orchestrator (`QAAP_CLOUD_MODE=docker`)

When set, `POST /qaap/api/cloud/workspaces/ensure` creates or starts a **Docker container per `repoKey`** (bind-mounts the workspace path, default image `node:20-bookworm` or `QAAP_DOCKER_IMAGE`).

```bash
export QAAP_CLOUD_MODE=docker
export QAAP_DOCKER_IMAGE=node:20-bookworm   # optional
# Docker socket: /var/run/docker.sock (or DOCKER_HOST)
```

Workspace records include `containerRef` (Docker container id).

## Electron + dev-container

Command **Open in Qaap Cloud Container** (`qaap.cloud.openInDevContainer`) writes `.devcontainer/devcontainer.json` if missing, then runs `dev-container:reopen-in-container`.

Requires Electron app with `@theia/dev-container` and `@theia/remote` (e.g. `examples/electron`).

## Deploy CLI (server-side)

| Endpoint | Description |
|----------|-------------|
| `POST /qaap/api/cloud/deploy/run` | Runs `vercel deploy` or `wrangler pages deploy` in `workspaceRoot` with env from deploy-env store |

Agent tools `qaap_deploy_vercel` / `qaap_deploy_cloudflare` call this endpoint (not hints only).

## Web Push (server subscriptions)

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Set on the backend:

```bash
export QAAP_VAPID_PUBLIC_KEY=...
export QAAP_VAPID_PRIVATE_KEY=...
export QAAP_VAPID_SUBJECT=mailto:you@example.com
```

3. Browser registers via service worker `pushManager.subscribe` → `POST /qaap/api/cloud/push/subscribe`
4. Events trigger `POST /qaap/api/cloud/push/notify` (build failed, agent completed)

PWA service worker includes `push` / `notificationclick` handlers (see `FrontendGenerator.compileServiceWorker`).

## Other env

- `QAAP_CLOUD_MODE=local` — local-sandbox metadata only (default)
- `QAAP_OAUTH_PUBLIC_URL` — public origin for preview share links
