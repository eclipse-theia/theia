---
name: update-default-models
description: Monthly refresh of the default LLM models of Theia's language model aliases (Anthropic, OpenAI, Google), including the per-model capability tables that cannot be auto-discovered. Use when asked to update the default models, aliases or provider model lists.
---

# Update default models

## 1. Know what is auto-discovered (do not touch)

- Anthropic, Google and OpenAI model lists are discovered from the provider `/models` endpoints; there are no curated list preferences anymore.
- Anthropic reasoning and max tokens come from the API.
- Google `inputTokenLimit` and the `thinking` flag come from `/v1beta/models`.
- Leave the Hugging Face defaults (`packages/ai-hugging-face/src/common/huggingface-preferences.ts`) alone unless asked.

## 2. Research the current lineup

Use web search for each provider (official docs first):

- Latest flagship, balanced and fast model per provider, and their exact API ids.
- Reasoning/thinking levels each new model accepts (which levels it rejects, whether thinking can be turned off).
- API constraints that break Theia's defaults, e.g. OpenAI models that only support tool calling via the Responses API (check the current default of `ai-features.openAiOfficial.useResponseApi` in `packages/ai-openai/src/common/openai-preferences.ts`).

Also check the previous model update PR (`gh pr list --search "default models" --state merged`) for scope and style.

## 3. Update the aliases

`packages/ai-core/src/browser/frontend-language-model-alias-registry.ts`:

- `default/code`, `default/universal`, `default/summarize`: flagship of each provider.
- `default/code-completion`: balanced model (e.g. Sonnet) for Anthropic.
- `default/fast`: fast/cheap tier of each provider.

Order is Anthropic, OpenAI, Google. Never pick a model that cannot call tools with Theia's default API settings.

## 4. Update the capability tables that are inferred from the model id

- OpenAI: `packages/ai-openai/src/node/openai-model-defaults.ts` (context window, reasoning levels per prefix; more specific prefixes first). Note `openai-reasoning.ts` maps `off` to omitting the effort, it does not send `none`.
- Google: `packages/ai-google/src/node/google-language-models-manager-impl.ts` (`reasoningApiFromModelId`, `reasoningSupportFromModelId`). Offer only levels the model accepts; invalid levels return HTTP 400.
- Anthropic: `deriveServerSideCompactionSupport` regex in `packages/ai-anthropic` must still match the new ids.

Add or extend the matching `*.spec.ts` tests for every changed mapping.

## 5. Validate and document

- Run the `compile`, `lint` and `test` tasks for each changed package (`ai-core`, `ai-google`, `ai-openai`, `ai-anthropic`).
- Do not add a `CHANGELOG.md` entry: model updates are not breaking (see `doc/pull-requests.md#changelog-entry`).
- In the PR, list what was deliberately not changed and why (e.g. a model blocked by an API constraint) and ask the maintainers about follow-ups.
