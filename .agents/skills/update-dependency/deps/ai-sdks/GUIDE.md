# AI provider SDKs and default models

- **Packages:** `openai` (`ai-openai`, `ai-chatgpt`), `@anthropic-ai/sdk` (`ai-anthropic`), `@google/genai` (`ai-google`), `@modelcontextprotocol/sdk` (`ai-mcp`, `ai-mcp-server`) with `zod` (`ai-mcp-server`, `ai-terminal`, `examples/api-samples`), `ollama` (`ai-ollama`), `@huggingface/inference` (`ai-hugging-face`), `@openai/codex-sdk` (`ai-codex`); the model aliases in `ai-core` and per-model defaults in the provider packages.
  Not dependencies: `@anthropic-ai/claude-agent-sdk` (`ai-claude-code`, installed globally by the user) and `@github/copilot-sdk` (`ai-copilot`, loaded from the user's Copilot CLI, types mirrored by hand).
- **Cadence:** caret ranges move with the [NPM upgrade](../npm-upgrade/GUIDE.md) after every release. `0.x` SDKs (`@anthropic-ai/sdk`, `ollama`, `@openai/codex-sdk`) and majors only move on demand: a provider feature, a new stream event, an endpoint change. Default models/aliases change when a provider releases a new model.
- **Docs:** [doc/Migration.md](../../../../../doc/Migration.md) (Dynamic Model Discovery), [doc/lockfile-maintenance.md](../../../../../doc/lockfile-maintenance.md); upstream changelogs: [openai-node](https://github.com/openai/openai-node/blob/master/CHANGELOG.md), [anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/CHANGELOG.md), [js-genai](https://github.com/googleapis/js-genai/blob/main/CHANGELOG.md), [MCP typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk/releases), [zod](https://zod.dev/v4/changelog).

Split this file into `ISSUES.md` and `LOG.md` next to it once a section gets too long to scan.

## Steps

1. Bump the range in every `package.json` that declares the SDK (`git grep -n '"<pkg>"' -- '*/package.json' 'packages/*/package.json'`); `openai` is in two packages, `zod` in three, the MCP SDK in two. Keep them identical.
2. Read the upstream changelog between the old and new version for removed/renamed types, new stream event types and changed client options. The SDK clients are built in one place per provider: `createOpenAiClient`/`MistralFixedOpenAI` (`ai-openai/src/node/openai-language-model.ts`), `createAnthropicClient`, `createGoogleClient`; all of them get `fetch: createProxyFetch(...)` from `ai-core/src/node/proxy-util.ts`.
3. Compile, then fix type errors in the stream handling before anything else; they show where event shapes changed.

### openai

- Used via Chat Completions (`openai-chat-completion-stream.ts`, own tool loop since #17623, not `runTools`) and the Responses API (`openai-response-api-utils.ts`, default for official models since #18094).
- `MistralFixedOpenAI` overrides the internal `prepareOptions` (`openai/internal/request-options`); check it still exists and still sees every request.
- `ChatGptResponseApiUtils.streamResponse` (`ai-chatgpt`) deliberately bypasses `responses.stream()`; keep the override.

### @anthropic-ai/sdk

- `^0.x` ranges only take patches: every minor is a manual bump.
- Model metadata (max tokens, thinking/effort capabilities, context window) comes from `models.retrieve`/`/v1/models` (`ModelInfo`, since #17443); check the type still carries those fields.

### @google/genai

- Text is read from `candidates[].content.parts`, not `chunk.text`; tool calls carry `thoughtSignature` in `ToolCall.data` (#16664). Recheck both after a minor bump.

### @modelcontextprotocol/sdk and zod

- Import SDK subpaths with `.js` (`@modelcontextprotocol/sdk/client/stdio.js`) in `node`/`common` code (#16410).
- `zod` is v4 in our packages; the hoisted root `zod` is 3.25.x (pulled in by `chromium-bidi`) and is what the SDK resolves. Bridge tool schemas with the `AnySchema` cast in `ai-mcp-server/src/node/mcp-frontend-contribution-manager.ts` (#17741).

### ollama, @huggingface/inference, @openai/codex-sdk, Copilot

- `ollama`: `ollama-language-model.ts` maps tools/thinking by hand; check the `Tool`/`Message` types.
- `@huggingface/inference`: uses `InferenceClient.chatCompletion(Stream)` (v4).
- `@openai/codex-sdk`: ESM, loaded via `dynamicImport` in `codex-service-impl.ts`; types are shared with the browser through `common/codex-service.ts`.
- Copilot: update `packages/ai-copilot/src/node/copilot-sdk-types.ts` and the version in its header; verify with `node scripts/copilot-sdk-mirror/run.js <version>` (also runs weekly in `copilot-sdk-mirror.yml`).

### Default models and aliases

Since #18011 the Anthropic, Google and OpenAI model lists are discovered from the provider; there are no curated preference lists anymore (`ai-features.<provider>.modelOverrides` replaces them for users). What still needs a PR when a provider releases a model:

1. `packages/ai-core/src/browser/frontend-language-model-alias-registry.ts`: `defaultModelIds` of `default/code`, `default/universal`, `default/code-completion`, `default/summarize`, `default/fast` as `<provider>/<model-id>`, one per provider.
2. OpenAI: `packages/ai-openai/src/node/openai-model-defaults.ts` (context window, reasoning levels; the models endpoint does not report them). First matching prefix wins: put specific ids before broader ones. Add a case to `openai-model-defaults.spec.ts`.
3. ChatGPT subscription: `CHATGPT_FALLBACK_MODELS` in `packages/ai-chatgpt/src/common/chatgpt-preferences.ts`.
4. Google: `reasoningApiFromModelId` in `google-language-models-manager-impl.ts` for a new Gemini major (effort vs. budget).
5. Anthropic: nothing per model; check the id parsing in `anthropic-language-models-manager-impl.ts` handles the new id form (dateless majors like `claude-opus-5`).

## Coupled versions

| When this changes | Also update |
|---|---|
| `openai` | both `ai-openai` and `ai-chatgpt`; `MistralFixedOpenAI.prepareOptions`; ChatGPT `streamResponse` |
| `@modelcontextprotocol/sdk` | `zod` in `ai-mcp-server`, `ai-terminal`, `examples/api-samples` (SDK accepts `^3.25 \|\| ^4.0`); same range in `ai-mcp` and `ai-mcp-server` |
| `undici` in `ai-core` (proxy) | stays within `openai`'s `undici` peer range (`>=5 <9` for 7.x) |
| Copilot CLI / `@github/copilot-sdk` | `copilot-sdk-types.ts` mirror and its header version |
| A new provider model | alias registry, provider defaults table (OpenAI), ChatGPT fallback list |

## Checks

- `npx lerna run test --scope '@theia/ai-*'` (the specs mock SDK streams and cover event handling).
- `npm run license:check` for every new transitive dependency of the SDK (see Known issues).
- Copilot mirror: `node scripts/copilot-sdk-mirror/run.js latest`.
- Manual (browser example, API key of the provider): model discovery refresh in the AI configuration, a streamed chat, a request with several tool calls in one turn (`@Coder`), reasoning on/off, a long session that triggers server-side compaction (OpenAI/Anthropic).
- MCP: start `@modelcontextprotocol/server-filesystem@latest` via `ai-features.mcp.mcpServers` and list its tools; connect an MCP client to the Theia MCP server at `http://localhost:3000/mcp` (#16780).

## Known issues

### OpenAI requests abort when server-side compaction runs

The provider sends a keep-alive heartbeat event that older `openai` versions do not handle and throw on. Update `openai` (6.46.0 fixed it). (#17802)

### ChatGPT subscription streams fail on `response.metadata` events

The SDK's `responses.stream()` accumulator rejects events it does not know. `ChatGptResponseApiUtils.streamResponse` iterates the raw `responses.create({ stream: true })` instead. (#18169)

### Type errors in `openai-response-api-utils.ts` / `openai-streaming-iterator.ts` after `openai` 7

`ResponseFunctionCallArgumentsDoneEvent` no longer types `name`, and `tool_calls` became a union with non-function calls. Read `name` defensively, take name/arguments from `response.output_item.done`, set `type = 'function'` only on calls with a `function`. (#18169)

### OpenAI model discovery fails with a `TypeError`

`MistralFixedOpenAI.prepareOptions` assumed every request has a `body`; `GET /v1/models` has none. Guard the body access. (#18058)

### OpenAI tool loops stop after 10 tool calls

The SDK's `runTools` stops after 10 completions by default; #15696 raised `maxChatCompletions` to 100. Since #17623 the Chat Completions loop is our own, so the limit no longer applies.

### `ZodError ... "expected": "object" ... "path": ["tools", 0, "inputSchema", "type"]` when listing MCP tools

MCP SDK 1.15.1 rejects tool schemas of current MCP servers. Update to ≥ 1.25.1 with zod 4: `server.tool()` → `server.registerTool()`, `zod-to-json-schema` → `z.toJSONSchema()`. (#16780)

### `z.fromJSONSchema(...)` not assignable to the MCP SDK's `inputSchema`

Two zod installs: our zod 4 vs. the hoisted zod 3.25 the SDK resolves. Cast through `AnySchema` from `@modelcontextprotocol/sdk/server/zod-compat.js`. (#17741)

### Backend with `@theia/ai-mcp` only starts when bundled

SDK subpath imports without `.js` do not resolve through the SDK's `exports` map in CommonJS. Add `.js`. (#16410)

### Gemini warns `there are non-text parts functionCall,thoughtSignature in the response` and tool loops lose context

`chunk.text` drops non-text parts and the thought signature. Read text from `parts`, return `thoughtSignature` with the tool call. (#16664)

### `https://api-inference.huggingface.co is no longer supported.`

Hugging Face moved to `router.huggingface.co`; needs `@huggingface/inference` 4.x (`InferenceClient`, `chatCompletion`). (#16864)

### License check fails on a new SDK dependency

`dash-licenses` does not know the new transitive package. On this repository the IPLab issue is opened by hand (`npm run license:check:review` exists for it). (#18169)

## Log

Newest first. One entry per merged update and target branch. No SDK or model update has been backported to a release branch so far.

| Date | Branch | From → To | PR | Notes |
|---|---|---|---|---|
| 2026-10-22 | master | `openai` ^6.49.0 → ^7.34.0 | #18169 | 7.x typing changes; ChatGPT `response.metadata` events; IPLab issue opened manually |
| 2026-10-12 | master | `@modelcontextprotocol/sdk` ^1.30.0 → ^1.32.1, `@huggingface/inference` ^4.13.28 → ^4.13.30 | #18149 | NPM upgrade after 1.76.0 |
| 2026-09-23 | master | models: fast alias → `gemini-3.8-flash`, `gpt-6-astra` defaults | #18033 | |
| 2026-09-22 | master | models: curated lists removed | #18011 | Discovery from provider endpoints; `modelOverrides` preferences; see Migration.md |
| 2026-09-15 | master | `@huggingface/inference` ^4.13.25 → ^4.13.28 | #18005 | NPM upgrade after 1.75.0 |
| 2026-08-24 | master | models: add `gemini-3.7-flash`, fast alias | #17947 | |
| 2026-08-12 | master | `openai` ^6.46.0 → ^6.49.0, MCP SDK ^1.29.0 → ^1.30.0, `@huggingface/inference` → ^4.13.25 | #17909 | NPM upgrade after 1.74.1 |
| 2026-07-27 | master | models: aliases → `claude-opus-5`/`claude-sonnet-5`, GPT-5.6 tiers, `gemini-3.6-flash` | #17817 | |
| 2026-07-22 | master | `openai` ^6.45.0 → ^6.46.0 | #17802 | Heartbeat event during compaction |
| 2026-07-13 | master | `openai` ^6.39.1 → ^6.45.0, `@huggingface/inference` → ^4.13.22 | #17741 | NPM upgrade; zod `AnySchema` cast in ai-mcp-server |
| 2026-06-24 | master | `@anthropic-ai/sdk` ^0.92.0 → ^0.93.0 | #17449 | Deferred tool loading (`defer_loading`, tool search) |
| 2026-06-18 | master | models: add `claude-opus-4-8`, `claude-fable-5`; aliases → `claude-opus-4-8` | #17674 | |
| 2026-06-18 | master | `openai` ^6.35.0 → ^6.39.1, `@google/genai` ^1.51.0 → ^1.52.0, `@huggingface/inference` → ^4.13.18 | #17589 | NPM upgrade |
| 2026-05-27 | master | `@anthropic-ai/sdk` ^0.65.0 → ^0.92.0 | #17443 | Model metadata from `/v1/models`; `openai-model-defaults.ts` introduced |
| 2026-05-27 | master | models: new `default/fast` alias | #17535 | haiku-4-5, gpt-5.4-mini, gemini-3.5-flash |
| 2026-05-21 | master | models: drop Claude 4.5, `gemini-3.5-flash` | #17524 | |
| 2026-05-08 | master | `openai` ^6.33.0 → ^6.35.0, `@google/genai` ^1.47.0 → ^1.51.0, `zod` ^4.3.6 → ^4.4.3 | #17446 | NPM upgrade |
| 2026-04-29 | master | models: `claude-opus-4-7`, `gpt-5.5`; aliases → opus-4-7 | #17409 | |
| 2026-04-10 | master | `openai` ^6.3.0 → ^6.33.0, `@google/genai` ^1.30.0 → ^1.47.0, MCP SDK ^1.25.1 → ^1.29.0, `ollama` ^0.5.16 → ^0.5.18, `zod` ^4.2.1 → ^4.3.6 | #17282 | NPM upgrade |
| 2026-03-20 | master | models: `gpt-5.4` family; aliases → sonnet-4-6, gpt-5.4 | #17180 | |
| 2026-02-26 | master | models: max tokens opus-4-6 / sonnet-4-6 | #17051 | |
| 2026-02-25 | master | models: aliases → `claude-opus-4-6` | #17066 | |
| 2026-02-23 | master | models: Claude 4.6, `gemini-3.1-pro-preview` | #17040 | |
| 2026-01-28 | master | `@modelcontextprotocol/sdk` ^1.15.1 → ^1.25.1, `zod` ^3.23.8 → ^4.2.1 | #16780 | `registerTool`, `z.toJSONSchema`; drops `zod-to-json-schema` |
| 2026-01-27 | master | `@huggingface/inference` ^2.0.0 → ^4.13.10 | #16864 | Endpoint moved; `InferenceClient` |
| 2026-01-19 | master | models: `gpt-5.2`, `gemini-3-flash-preview` | #16828 | |
| 2025-12-10 | master | models: aliases → `claude-opus-4-5` | #16734 | |
| 2025-12-09 | master | `@google/genai` ^1.16.0 → ^1.30.0 | #16664 | `thoughtSignature`, text from parts |
| 2025-11-26 | master | models: add `claude-opus-4-5` | #16656 | |
| 2025-11-24 | master | models: Claude 4.5, `gemini-3-pro-preview` | #16636 | |
| 2025-10-23 | master | `openai` ^5.0.1 → ^6.3.0, `@anthropic-ai/sdk` ^0.52.0 → ^0.65.0 | #16453 | Proxy support via `undici` |
| 2025-09-02 | master | `@google/genai` ^1.3.0 → ^1.16.0 | #16228 | |
| 2025-08-12 | master | models: add `gpt-5` family | #16169 | |
| 2025-07-30 | master | models: alias registry introduced | #15782 | |
| 2025-07-20 | master | `@modelcontextprotocol/sdk` ^1.12.1 → ^1.15.1 | #16002 | |
| 2025-06-26 | master | `@modelcontextprotocol/sdk` 1.0.1 → ^1.12.1 | #15842 | Remote MCP servers |
| 2025-06-16 | master | `ollama` ^0.5.8 → ^0.5.16 | #15795 | |
| 2025-06-10 | master | models: Opus 4 max tokens 32000 | #15788 | |
| 2025-06-05 | master | `@google/genai` latest → ^1.3.0 | #15737 | Gemini defaults updated |
| 2025-06-04 | master | `@anthropic-ai/sdk` ^0.39.0 → ^0.52.0 | #15731 | Prompt caching |
| 2025-06-02 | master | `openai` ^4.77.0 → ^5.0.1 | #15696 | `maxChatCompletions` 100 |
| 2025-05-27 | master | models: Claude 4 | #15640 | |
| 2025-04-19 | master | models: Gemini 2.5 Flash | #15487 | |
| 2025-04-18 | master | models: `gpt-4.1`, `o3`, `o4-mini` | #15465 | |
| 2025-03-27 | master | `@anthropic-ai/sdk` ^0.32.1 → ^0.39.0 | #15092 | Thinking support |
| 2025-03-17 | master | models: Anthropic max tokens | #15198 | |
| 2025-03-11 | master | models: `gpt-4.5-preview` | #15090 | |
| 2025-02-25 | master | models: Claude 3.7 Sonnet | #15023 | |
| 2025-02-03 | master | models: OpenAI `o1`, `o3-mini` | #14808 | |
