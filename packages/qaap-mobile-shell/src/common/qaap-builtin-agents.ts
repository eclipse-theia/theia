// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Built-in VPS coding-agent CLI the task runner can auto-detect on PATH. */
export interface QaapBuiltinAgentDefinition {
    readonly id: string;
    readonly label: string;
    /** Executable looked up with `which <bin>` (may differ from {@link id}). */
    readonly bin: string;
    /** Shell template; `{prompt}` is replaced with a quoted user prompt. */
    readonly template: string;
}

/**
 * Auto-detected server-side agent CLIs (AionUi-compatible core set).
 * QAIQ is registered separately in the task runner because it uses `{qaiq_flags}` and stream-json.
 * Niche or ACP-only CLIs (Snow, Kiro, Nanobot, vibe-acp, …) stay in `QAAP_AGENT_COMMANDS`.
 */
export const QAAP_BUILTIN_AGENT_DEFINITIONS: readonly QaapBuiltinAgentDefinition[] = [
    { id: 'codex', label: 'Codex', bin: 'codex', template: 'codex exec --json {model_flags} {prompt}' },
    { id: 'claude', label: 'Claude Code', bin: 'claude', template: 'claude --print --output-format stream-json --verbose --include-partial-messages {model_flags} -p {prompt}' },
    { id: 'aider', label: 'Aider', bin: 'aider', template: 'aider --yes-always {model_flags} --message {prompt}' },
    { id: 'opencode', label: 'OpenCode', bin: 'opencode', template: 'opencode run --format json --dangerously-skip-permissions {model_flags} {prompt}' },
    { id: 'goose', label: 'Goose', bin: 'goose', template: 'goose run --no-session -t {prompt}' },
    { id: 'hermes', label: 'Hermes', bin: 'hermes', template: 'hermes chat -q {prompt}' },
    { id: 'openclaw', label: 'OpenClaw', bin: 'openclaw', template: 'openclaw agent --local --message {prompt}' },
    { id: 'cursor', label: 'Cursor Agent', bin: 'cursor-agent', template: 'cursor-agent -p --force {prompt}' },
    { id: 'antigravity', label: 'Antigravity CLI', bin: 'antigravity', template: 'antigravity -p {prompt}' },
    { id: 'copilot', label: 'Copilot CLI', bin: 'copilot', template: 'copilot --autopilot --yolo --max-autopilot-continues 20 -p {prompt}' },
    { id: 'qwen', label: 'Qwen Code', bin: 'qwen', template: 'qwen -p --approval-mode yolo {model_flags} {prompt}' },
    { id: 'kimi', label: 'Kimi CLI', bin: 'kimi', template: 'kimi -p {prompt}' },
];

export const QAAP_BUILTIN_AGENT_IDS = new Set(QAAP_BUILTIN_AGENT_DEFINITIONS.map(definition => definition.id));

export const CURSOR_AGENT_ID = 'cursor';

/** VPS agents detected on PATH but not offered in mobile/desktop agent pickers. */
export const UI_HIDDEN_VPS_AGENT_IDS = new Set([CURSOR_AGENT_ID]);

/** VPS agents whose CLI model list is not API-selectable in headless runs (no `{model_flags}`). */
export const NATIVE_MODEL_CATALOG_EXCLUDED_AGENT_IDS = new Set([CURSOR_AGENT_ID]);

export function isUiHiddenVpsAgent(agentId: string | undefined): boolean {
    const normalized = agentId?.trim().toLowerCase();
    return !!normalized && UI_HIDDEN_VPS_AGENT_IDS.has(normalized);
}

/**
 * OpenAI Codex CLI changed its headless entrypoint over time:
 * - newer versions expose `codex exec <prompt>`;
 * - older research-preview builds only support `codex -q <prompt>`.
 *
 * Background tasks cannot use the interactive TUI because the server process has no raw TTY,
 * so detect the installed CLI shape and always pick a non-interactive template.
 */
export function resolveQaapCodexTemplate(helpText: string): string {
    return /\bcodex\s+exec\b/.test(helpText) || /^\s+exec\b/m.test(helpText)
        ? 'codex exec --json {model_flags} {prompt}'
        : 'codex -q --json {model_flags} {prompt}';
}

/** Mention / storage alias for {@link QAAP_BUILTIN_AGENT_DEFINITIONS} ids. */
export function resolveQaapBuiltinAgentMentionId(token: string): string | undefined {
    const normalized = token.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (normalized === 'cursor-agent') {
        return 'cursor';
    }
    if (normalized === 'gemini') {
        return 'antigravity';
    }
    return QAAP_BUILTIN_AGENT_IDS.has(normalized) ? normalized : undefined;
}
