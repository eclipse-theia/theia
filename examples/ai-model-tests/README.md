<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI MODEL TESTS</h2>

<hr />

</div>

## Description

The `@theia/ai-model-tests` package is a local test harness for evaluating AI model updates. It runs prompts through Theia's actual chat agents (with tool calls), then uses a Judge agent to evaluate the results. Everything runs through Theia — no separate SDK dependencies needed.

The test harness uses whichever AI models are configured in the running Theia instance. You must have valid API keys set up for at least one supported provider (Anthropic, OpenAI, or Google), either through Theia's preferences (e.g. `ai-features.anthropicApiKey`) or through environment variables (e.g. `ANTHROPIC_API_KEY`).

The package is for test purposes only and is not published on `npm` (`private: true`).

### How It Works

1. Connects to a running Theia instance via Playwright
2. Fetches all registered models from Anthropic, OpenAI, and Google
3. For each model: sets it on the agent via `agentSettings`, sends the prompt, waits for completion
4. Captures the full conversation including tool calls and token usage
5. Saves a `.patch` file of the agent's file changes, then resets the workspace between runs
6. Sends each conversation to a Judge agent for evaluation
7. Generates a markdown + JSON report and saves all conversations

### Setup

#### 1. Build and start Theia

```bash
# From the repo root
npm run build
npm run start:browser
```

Make sure your API keys are configured in Theia's preferences or as environment variables (see above).

#### 2. Run the tests

```bash
cd examples/ai-model-tests
npm run model-test
# OR
npx tsx src/run.ts
```

Pass CLI options:

```bash
npm run model-test -- -help
# OR
npx tsx src/run.ts --help
```

### CLI Options

```bash
Usage: npx tsx src/run.ts [options]

Options:
  -s, --scenario <id>   Run only the scenario with this ID
  -e, --skip-eval       Skip judge evaluation (just capture agent responses)
  -h, --headed          Show the browser window
  -k, --keep-open       Keep browser open after tests for inspection
      --help            Show this help message
```

### npm Scripts

| Script | Command | Description |
| --- | --- | --- |
| `npm run model-test` | `tsx src/run.ts` | Run all scenarios |
| `npm run model-test:headed` | `tsx src/run.ts -h` | Run all, visible browser |
| `npm run model-test:headed:keep-open` | `tsx src/run.ts -h -k` | Run all, browser stays open |
| `npm run model-test:skip-eval` | `tsx src/run.ts -e` | Run all, skip judge evaluation |
| `npm run model-test:smoke` | `tsx src/run.ts -s smoke-hello` | Run smoke test only |
| `npm run model-test:coder` | `tsx src/run.ts -s coder-reset-button` | Run Coder scenario only |
| `npm run model-test:coder:headed` | `tsx src/run.ts -s coder-reset-button -h -k` | Run Coder scenario, browser stays open after completion |

Reports are written to `results/` as both JSON and Markdown. File names include the scenario and model IDs for easy identification. Additionally:
- All chat threads are saved as a conversations JSON file
- Each model run's file changes are saved as `.patch` files, so you can review what each model actually changed

### Test Bridge

The test bridge is a `FrontendApplicationContribution` in `examples/api-samples/` that activates when Theia is opened with `?test-bridge` in the URL. It exposes `window.__theiaTestBridge` with:

- `getAgents()` — list available chat agents
- `createSession(agentId?)` — create a chat session pinned to an agent
- `sendMessage(sessionId, text)` — send a prompt and wait for completion
- `getConversation(sessionId)` — get the full serialized conversation
- `getAllConversations()` — export all chat threads
- `getModels()` — list all registered language model IDs
- `setAgentModel(agentId, modelId)` — set the model for an agent via agentSettings

### Judge Agent

The Judge agent is a chat agent (also in `examples/api-samples/`) that evaluates responses. It receives the original prompt, expected behavior, and the assistant's response (including tool calls), and returns a structured JSON evaluation with score, reasoning, and issues.

### Adding Scenarios

Drop a `.md` file in `scenarios/`. All configuration is in the frontmatter:

```markdown
---
id: my-scenario
description: What this tests
agent: Coder                     # which chat agent to use
runs: 1                          # how many times to run per model (default: 1)
---

# Prompt

Your prompt text here.

# Expected Behavior

- What the response should contain
- Criteria the judge will check
```

#### Frontmatter Options

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `id` | no | filename | Unique scenario identifier |
| `description` | no | filename | Short description shown in output |
| `agent` | no | Coder | Which chat agent to use |
| `models` | no | all default | List of model IDs to test (see below) |
| `runs` | no | 1 | Number of times to repeat per model |

#### Model Selection

By default, the scenario runs with all models registered in Theia from Anthropic, OpenAI, and Google (i.e., whatever you have configured in the provider model preferences). To test specific models, add a `models` list:

```yaml
---
id: my-scenario
description: Compare specific models
models:
  - anthropic/claude-opus-4-7
  - openai/gpt-5.5
  - google/gemini-3.1-pro-preview
agent: Coder
---
```

#### Repeated Runs

Set `runs` in the frontmatter to repeat a scenario multiple times per model. This is useful for testing consistency. The report includes per-run results and an average summary row:

```yaml
---
id: consistency-test
description: Test model consistency over 5 runs
agent: Coder
runs: 5
models:
  - anthropic/claude-opus-4-7
---
```

### Customizing Evaluation

The judge prompt template lives in `evaluation/judge-quality.md`. It uses `{{prompt}}`, `{{expected_behavior}}`, and `{{response}}` placeholders.

### Project Structure

```bash
scenarios/           Prompt files (markdown with YAML frontmatter)
evaluation/          Judge prompt templates
src/
  config.ts          Environment and paths
  scenario-loader.ts Parses scenario files
  report-writer.ts   JSON + markdown report generation
  run.ts             CLI entry point (Playwright + test bridge)
results/             Generated reports (gitignored)
```

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
