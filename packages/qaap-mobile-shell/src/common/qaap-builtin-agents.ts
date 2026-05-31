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
    { id: 'codex', label: 'Codex', bin: 'codex', template: 'codex exec {prompt}' },
    { id: 'claude', label: 'Claude Code', bin: 'claude', template: 'claude -p {prompt}' },
    { id: 'aider', label: 'Aider', bin: 'aider', template: 'aider --yes-always --message {prompt}' },
    { id: 'opencode', label: 'OpenCode', bin: 'opencode', template: 'opencode run --dangerously-skip-permissions {prompt}' },
    { id: 'goose', label: 'Goose', bin: 'goose', template: 'goose run --no-session -t {prompt}' },
    { id: 'hermes', label: 'Hermes', bin: 'hermes', template: 'hermes chat -q {prompt}' },
    { id: 'openclaw', label: 'OpenClaw', bin: 'openclaw', template: 'openclaw agent --local --message {prompt}' },
    { id: 'cursor', label: 'Cursor Agent', bin: 'cursor-agent', template: 'cursor-agent -p --force {prompt}' },
    { id: 'gemini', label: 'Gemini CLI', bin: 'gemini', template: 'gemini -p --approval-mode=yolo {prompt}' },
    { id: 'copilot', label: 'Copilot CLI', bin: 'copilot', template: 'copilot --autopilot --yolo --max-autopilot-continues 20 -p {prompt}' },
    { id: 'qwen', label: 'Qwen Code', bin: 'qwen', template: 'qwen -p --approval-mode yolo {prompt}' },
    { id: 'kimi', label: 'Kimi CLI', bin: 'kimi', template: 'kimi -p {prompt}' },
];

export const QAAP_BUILTIN_AGENT_IDS = new Set(QAAP_BUILTIN_AGENT_DEFINITIONS.map(definition => definition.id));

/** Mention / storage alias for {@link QAAP_BUILTIN_AGENT_DEFINITIONS} ids. */
export function resolveQaapBuiltinAgentMentionId(token: string): string | undefined {
    const normalized = token.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (normalized === 'cursor-agent') {
        return 'cursor';
    }
    return QAAP_BUILTIN_AGENT_IDS.has(normalized) ? normalized : undefined;
}
