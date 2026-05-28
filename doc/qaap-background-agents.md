# QAAP Background Agents

QAAP background tasks run in the server process, so they continue after the
browser tab is closed. The server auto-detects these CLIs on `PATH`:

- `codex` -> `codex exec {prompt}`
- `claude` -> `claude -p {prompt}`
- `qaiq` -> `qaiq --bare --print --output-format stream-json --verbose --include-partial-messages --dangerously-skip-permissions {qaiq_flags} {prompt}`
  (stream-json is parsed live in chat/transcript UIs: thinking blocks, tool calls, and assistant text)
  (`{qaiq_flags}` is filled from your Settings API keys: Gemini, OpenRouter, Ollama, …)
- `aider` -> `aider --yes-always --message {prompt}`

The Docker runtime image builds and installs **[QAIQ](https://github.com/juancristobalgd1/qaiq)**
(QAAP's fork of the OpenClaude coding-agent CLI) and Aider. Codex and Claude Code still need
their own CLI/auth setup if you want to use them.

QAIQ is the generic BYOK/free-tier path: it can run non-interactively in the server with
providers such as `openai`, `gemini`, `ollama`, and other OpenAI-compatible routes. Select it
with `@qaiq` or make it the default with `QAAP_DEFAULT_AGENT=qaiq`.

When several CLIs are installed, QAAP prefers **QAIQ**, then Aider, before Codex or Claude Code
— so background jobs do not silently burn Codex subscription quota unless you pick `@codex` or
set `QAAP_DEFAULT_AGENT=codex`.

For OpenRouter, QAIQ uses your Settings model alias (`default/code`) or the first entry in
`openrouterModels`, not a hardcoded model id.

For **Hetzner / VPS Docker** deployment (firewall, `.env` API keys, volumes), see
[qaap-vps-deployment.md](./qaap-vps-deployment.md).

## Installing QAIQ locally

QAAP only detects the **`qaiq`** agent id in the UI. The server looks for a `qaiq` binary on `PATH`, or falls back to a legacy `openclaude` binary (same fork) while installs catch up.

```bash
git clone https://github.com/juancristobalgd1/qaiq.git
cd qaiq
bun install
bun run build
ln -sf "$(pwd)/bin/qaiq" ~/.local/bin/qaiq
```

Requires [Bun](https://bun.sh) and Node ≥ 22.

## Custom Free-Tier/BYOK Providers

Use `QAAP_AGENT_COMMANDS` to expose additional server-side agents without code changes.
It is a JSON array:

```bash
QAAP_AGENT_COMMANDS='[
  {
    "id": "aider-gemini",
    "label": "Aider Gemini",
    "bin": "aider",
    "template": "aider --yes-always --model gemini/gemini-2.5-flash --message {prompt}"
  },
  {
    "id": "aider-openrouter",
    "label": "Aider OpenRouter",
    "bin": "aider",
    "template": "aider --yes-always --model openrouter/deepseek/deepseek-chat --message {prompt}"
  },
  {
    "id": "qaiq-gemini",
    "label": "QAIQ Gemini",
    "bin": "qaiq",
    "template": "qaiq --print --dangerously-skip-permissions --provider gemini --model gemini-2.5-flash {prompt}"
  },
  {
    "id": "qaiq-ollama",
    "label": "QAIQ Ollama",
    "bin": "qaiq",
    "template": "qaiq --print --dangerously-skip-permissions --provider ollama --model qwen2.5-coder:7b {prompt}"
  }
]'
```

Provider credentials can come from QAAP/Theia preferences or the environment.
Before spawning a background job, QAAP maps known preferences to CLI env vars:
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`,
`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OLLAMA_HOST`, and
`HUGGINGFACE_API_KEY`. Explicit environment variables win.

For providers without a QAAP preference yet, set the CLI's expected env var in
`.env`, for example `GROQ_API_KEY`, `MISTRAL_API_KEY`, or `OPENAI_BASE_URL`.

For OpenAI-compatible free-tier gateways, define a custom QAIQ command and pass the gateway
as an OpenAI-compatible provider:

```bash
QAAP_AGENT_COMMANDS='[
  {
    "id": "qaiq-openrouter",
    "label": "QAIQ OpenRouter",
    "bin": "qaiq",
    "template": "OPENAI_API_KEY=$OPENROUTER_API_KEY OPENAI_BASE_URL=${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1} qaiq --print --dangerously-skip-permissions --provider openai --model nvidia/nemotron-3-super-120b-a12b:free {prompt}"
  }
]'
```

Set `QAAP_DEFAULT_AGENT=aider-gemini` to make one custom agent the default.

`QAAP_AGENT_COMMAND` remains supported for a single legacy custom command. Prefer
`QAAP_AGENT_COMMANDS` when you want several choices in the UI.

## Browser Mode Boundary

The existing QAAP/TheAI integrated browser remains the right path for interactive Coder work.
Background jobs must use server-side tools because the user's tab can close. For browser
automation in background, wire a server-side Playwright-based tool/CLI into `QAAP_AGENT_COMMANDS`
or into a future QAAP agent runtime; do not depend on the frontend mini-browser tab.

## Hacking QAIQ for QAAP

Product-specific fixes (OpenRouter-only auth, quieter logs, QAAP env conventions) belong in the
**qaiq** fork, not in upstream Theia packages. After changing qaiq, rebuild and ensure `qaiq`
`qaiq` is on the server `PATH`, then restart the QAAP backend.
