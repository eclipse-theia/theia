// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Shared HTTP + persistence helpers for background agent tasks.
 * Keep {@link QAAP_AGENT_TASK_API_PATH} in sync with `@theia/qaap-cloud-workspace`.
 */
import {
    isUiHiddenVpsAgent,
    resolveQaapBuiltinAgentMentionId,
} from './qaap-builtin-agents';
import {
    readStoredAgentModel,
    resolveStoredAgentModelForSubmit,
    writeStoredAgentModel,
} from './qaap-agent-model-selection';

export {
    agentSupportsModelPicker,
    agentUsesNativeModelCatalog,
    agentUsesSettingsModelCatalog,
    isSameAgentModel,
    readStoredAgentModel,
    resolveStoredAgentModelForSubmit,
    writeStoredAgentModel,
} from './qaap-agent-model-selection';

export const QAAP_AGENT_TASK_API_PATH = '/qaap/api/agent-tasks';

export const SHELL_AGENT_ID = 'shell';
export const THEIA_CODER_AGENT_ID = 'Coder';
export const QAIQ_AGENT_ID = 'qaiq';

/** Primary VPS agent for the Qaap product (composer default, new sessions). */
export const QAAP_PRIMARY_AGENT_ID = QAIQ_AGENT_ID;

/** UI/storage id before the QAIQ rename; still accepted when resolving selection. */
export const LEGACY_OPENCLAUDE_AGENT_ID = 'openclaude';

const QAAP_RETIRED_DEFAULT_AGENT_IDS = new Set([
    THEIA_CODER_AGENT_ID.toLowerCase(),
    'coder',
]);

/** Normalize a mention token (lowercase); does not validate availability. */
export function resolveQaapAgentMentionToken(token: string): string {
    return token.trim().toLowerCase();
}

/** Legacy global fallback for users that picked an agent before selections became cwd-scoped. */
export const SELECTED_AGENT_STORAGE_KEY = 'qaap.agentTasks.selectedAgent';
export const SELECTED_QAIQ_MODEL_STORAGE_KEY = 'qaap.agentTasks.selectedQaiqModel';

export interface QaapAgentTaskAgentOption {
    readonly id: string;
    readonly label: string;
    readonly available: boolean;
}

export interface QaapAgentTaskListSnapshot {
    readonly agents: QaapAgentTaskAgentOption[];
    readonly agentConfigured: boolean;
    readonly defaultAgent?: string;
    readonly qaiqModels: QaapQaiqModelOption[];
}

export interface QaapQaiqModelOption {
    readonly provider: 'openai' | 'gemini' | 'ollama' | 'anthropic' | 'mistral';
    readonly vendor: string;
    readonly modelId: string;
    readonly label: string;
}

export interface QaapCreateAgentTaskQaiqModel {
    readonly provider: 'openai' | 'gemini' | 'ollama' | 'anthropic' | 'mistral';
    readonly vendor: string;
    readonly modelId: string;
}

export interface QaapAgentTaskCreated {
    readonly id: string;
    readonly cwd: string;
    readonly state: string;
    readonly title?: string;
    readonly command?: string;
    readonly createdAt?: number;
}

/** A task plus its captured stdout/stderr log — returned by `GET /qaap/api/agent-tasks/:id`. */
export interface QaapAgentTaskDetailDTO {
    readonly id: string;
    readonly cwd: string;
    readonly command?: string;
    readonly state: string;
    readonly exitCode?: number;
    readonly finishedAt?: number;
    readonly log: string;
}

/** True once a task has stopped and will not change state again. */
export function isAgentTaskFinished(state: string): boolean {
    return state !== 'running';
}

export type QaapCreateAgentTaskBody =
    | { readonly command: string; readonly cwd: string }
    | {
        readonly prompt: string;
        readonly agent: string;
        readonly cwd: string;
        readonly agentModel?: QaapCreateAgentTaskQaiqModel;
        /** @deprecated Use {@link agentModel}. */
        readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
        /** Resolved cross-project context, prepended to the agent prompt by the backend runner. */
        readonly contextPreamble?: string;
    };

export function scopedAgentStorageKey(cwd: string): string {
    return `${SELECTED_AGENT_STORAGE_KEY}.${hashString(cwd)}`;
}

export function scopedQaiqModelStorageKey(cwd: string): string {
    return `${SELECTED_QAIQ_MODEL_STORAGE_KEY}.${hashString(cwd)}`;
}

export function migrateLegacyBackendAgentId(agentId: string | undefined): string | undefined {
    if (!agentId) {
        return undefined;
    }
    return agentId === LEGACY_OPENCLAUDE_AGENT_ID ? QAIQ_AGENT_ID : agentId;
}

/** Map retired defaults (Coder, Codex, …) to {@link QAAP_PRIMARY_AGENT_ID} for Qaap product UI. */
export function migrateQaapProductAgentId(agentId: string | undefined): string | undefined {
    const migrated = migrateLegacyBackendAgentId(agentId);
    if (!migrated) {
        return undefined;
    }
    if (isTheiaCoderAgent(migrated) || QAAP_RETIRED_DEFAULT_AGENT_IDS.has(migrated.trim().toLowerCase())) {
        return QAAP_PRIMARY_AGENT_ID;
    }
    return migrated;
}

export function readStoredAgent(cwd: string | undefined): string | undefined {
    try {
        const raw = cwd
            ? window.localStorage.getItem(scopedAgentStorageKey(cwd)) ?? window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY) ?? undefined
            : window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY) ?? undefined;
        return migrateQaapProductAgentId(raw ?? undefined);
    } catch {
        return undefined;
    }
}

export function writeStoredAgent(cwd: string | undefined, agentId: string): void {
    try {
        if (cwd) {
            window.localStorage.setItem(scopedAgentStorageKey(cwd), agentId);
        }
        window.localStorage.setItem(SELECTED_AGENT_STORAGE_KEY, agentId);
    } catch {
        /* localStorage unavailable — selection is session-only */
    }
}

export function readStoredQaiqModel(cwd: string | undefined): QaapCreateAgentTaskQaiqModel | undefined {
    return readStoredAgentModel(cwd, QAIQ_AGENT_ID);
}

export function toQaapCreateAgentTaskQaiqModel(model: {
    readonly provider: QaapCreateAgentTaskQaiqModel['provider'];
    readonly vendor: string;
    readonly modelId: string;
}): QaapCreateAgentTaskQaiqModel {
    return {
        provider: model.provider,
        vendor: model.vendor,
        modelId: model.modelId,
    };
}

/** @deprecated Use {@link resolveStoredAgentModelForSubmit}. */
export function resolveStoredQaiqModelForAgent(
    agentId: string | undefined,
    cwd: string | undefined,
): QaapCreateAgentTaskQaiqModel | undefined {
    return resolveStoredAgentModelForSubmit(agentId, cwd);
}

export function writeStoredQaiqModel(
    cwd: string | undefined,
    model: QaapCreateAgentTaskQaiqModel | QaapQaiqModelOption,
): void {
    writeStoredAgentModel(cwd, QAIQ_AGENT_ID, model);
}

/**
 * Pick a valid agent id: honor the current choice, then per-cwd storage, then server default.
 */
export function reconcileSelectedAgent(
    current: string | undefined,
    agents: readonly QaapAgentTaskAgentOption[],
    defaultAgent: string | undefined,
    cwd: string | undefined,
): string {
    const selectable = filterUiSelectableVpsAgents(agents);
    const ids = new Set(selectable.map(agent => agent.id));
    const normalizedCurrent = migrateQaapProductAgentId(current);
    if (normalizedCurrent && ids.has(normalizedCurrent)) {
        return normalizedCurrent;
    }
    const stored = readStoredAgent(cwd);
    if (stored && ids.has(stored)) {
        return stored;
    }
    if (!normalizedCurrent && !stored && ids.has(QAAP_PRIMARY_AGENT_ID)) {
        return QAAP_PRIMARY_AGENT_ID;
    }
    const normalizedDefault = migrateQaapProductAgentId(defaultAgent);
    if (normalizedDefault && ids.has(normalizedDefault)) {
        return normalizedDefault;
    }
    if (ids.has(QAAP_PRIMARY_AGENT_ID)) {
        return QAAP_PRIMARY_AGENT_ID;
    }
    return selectable[0]?.id ?? SHELL_AGENT_ID;
}

/**
 * Composer pickers list only the VPS-backed agents the server detected as installed
 * (CLI found on PATH or env-configured); undetected built-ins are not padded in.
 */
export function mergeComposerAgentPickerOptions(
    agents: readonly QaapAgentTaskAgentOption[],
): QaapAgentTaskAgentOption[] {
    const merged = new Map<string, QaapAgentTaskAgentOption>();
    for (const agent of filterUiSelectableVpsAgents(agents)) {
        if (agent.available === false) {
            continue;
        }
        merged.set(agent.id.toLowerCase(), agent);
    }
    return Array.from(merged.values()).sort((left, right) => left.label.localeCompare(right.label));
}

/** Composer pickers expose VPS-backed agents (QAIQ, Codex, …) but hide shell and UI-hidden runners. */
export function filterQaapComposerAgents(
    agents: readonly QaapAgentTaskAgentOption[],
): QaapAgentTaskAgentOption[] {
    return mergeComposerAgentPickerOptions(agents);
}

/**
 * Sticky/transcript composer agent picker — honors the current/stored choice, then defaults to
 * {@link QAAP_PRIMARY_AGENT_ID} when available.
 */
export function reconcileStickyComposerAgent(
    current: string | undefined,
    agents: readonly QaapAgentTaskAgentOption[],
    defaultAgent: string | undefined,
    cwd: string | undefined,
    coderAgentAvailable = false,
): string {
    const composerAgents = filterQaapComposerAgents(agents);
    const normalizedCurrent = migrateQaapProductAgentId(current);
    if (isTheiaCoderAgent(normalizedCurrent)) {
        return coderAgentAvailable
            ? THEIA_CODER_AGENT_ID
            : reconcileSelectedAgent(undefined, composerAgents, defaultAgent, cwd);
    }
    return reconcileSelectedAgent(normalizedCurrent, composerAgents, defaultAgent, cwd);
}

export function isStickyComposerAgentSelected(
    agentId: string,
    selectedAgentId: string | undefined,
    cwd: string | undefined,
): boolean {
    const effective = migrateLegacyBackendAgentId(selectedAgentId)
        ?? migrateLegacyBackendAgentId(readStoredAgent(cwd));
    if (!effective) {
        return false;
    }
    if (isTheiaCoderAgent(agentId)) {
        return isTheiaCoderAgent(effective);
    }
    return effective === agentId;
}

export function buildCreateAgentTaskBody(draft: string, agent: string, cwd: string, contextPreamble?: string): QaapCreateAgentTaskBody {
    if (agent === SHELL_AGENT_ID) {
        return { command: draft, cwd };
    }
    const base = { prompt: draft, agent, cwd, ...(contextPreamble ? { contextPreamble } : {}) };
    const agentModel = resolveStoredAgentModelForSubmit(agent, cwd);
    return agentModel ? { ...base, agentModel, qaiqModel: agentModel } : base;
}

export function shellAgentFallback(): QaapAgentTaskAgentOption {
    return { id: SHELL_AGENT_ID, label: 'Shell', available: true };
}

/** Agents offered in mobile/desktop pickers (excludes shell and UI-hidden VPS agents). */
export function filterUiSelectableVpsAgents(
    agents: readonly QaapAgentTaskAgentOption[],
): QaapAgentTaskAgentOption[] {
    return agents.filter(agent => agent.id !== SHELL_AGENT_ID && !isUiHiddenVpsAgent(agent.id));
}

/** Map UI / mention tokens to a built-in backend runner agent id, when recognized. */
export function normalizeBackendAgentId(agentId: string | undefined): string | undefined {
    const normalized = agentId?.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    const id = resolveQaapAgentMentionToken(normalized);
    const builtin = resolveQaapBuiltinAgentMentionId(id);
    if (builtin) {
        return builtin;
    }
    if (id === QAIQ_AGENT_ID) {
        return QAIQ_AGENT_ID;
    }
    return id === SHELL_AGENT_ID ? SHELL_AGENT_ID : undefined;
}

export function isTheiaCoderAgent(agentId: string | undefined): boolean {
    return agentId?.trim().toLowerCase() === THEIA_CODER_AGENT_ID.toLowerCase();
}

export function isTheiaCoderMention(content: string): boolean {
    return /^@coder\b/i.test(content.trim());
}

/** Chat composer always routes to Coder — strip a leading VPS @mention from the draft. */
export function stripNonCoderAgentMention(content: string): string {
    const trimmed = content.trim();
    const mentioned = extractBackendAgentMention(trimmed);
    if (!mentioned || isTheiaCoderAgent(mentioned)) {
        return trimmed;
    }
    const escaped = mentioned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return trimmed.replace(new RegExp(`^@${escaped}\\b\\s*`, 'i'), '').trim();
}

export function isQaiqAgent(agentId: string | undefined): boolean {
    const normalized = agentId?.trim().toLowerCase();
    return normalized === QAIQ_AGENT_ID || normalized === LEGACY_OPENCLAUDE_AGENT_ID;
}

/** OpenCode conversations use {@code --format json} NDJSON parsed into transcript segments. */
export function isOpencodeAgent(agentId: string | undefined): boolean {
    return agentId?.trim().toLowerCase() === 'opencode';
}

export function isClaudeCodeAgent(agentId: string | undefined): boolean {
    return agentId?.trim().toLowerCase() === 'claude';
}

export function isCodexAgent(agentId: string | undefined): boolean {
    return agentId?.trim().toLowerCase() === 'codex';
}

export function isAntigravityAgent(agentId: string | undefined): boolean {
    const normalized = agentId?.trim().toLowerCase();
    return normalized === 'antigravity' || normalized === 'gemini';
}

/** VPS agents whose stdout is parsed into thinking / tool / text transcript segments. */
export function usesStructuredAgentTranscript(agentId: string | undefined): boolean {
    return isQaiqAgent(agentId)
        || isOpencodeAgent(agentId)
        || isClaudeCodeAgent(agentId)
        || isCodexAgent(agentId)
        || isAntigravityAgent(agentId);
}

/**
 * Agent for a mobile/background submit: `@mention` in the draft wins, then the pinned chat agent.
 */
export function resolveExplicitAgentForSubmit(
    draft: string,
    options: { readonly pinnedChatAgentId?: string },
): string | undefined {
    const mentioned = extractBackendAgentMention(draft);
    if (mentioned) {
        return mentioned;
    }
    const pinned = options.pinnedChatAgentId?.trim();
    if (!pinned) {
        return undefined;
    }
    return migrateLegacyBackendAgentId(pinned) ?? pinned;
}

/**
 * Last recognized `@agent` mention in `text` (e.g. `@Codex` near the end of a message wins over
 * an older `@Claude` in the same string).
 */
export function extractBackendAgentMention(text: string): string | undefined {
    const regex = /@([a-z][\w-]*)/gi;
    let last: string | undefined;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const resolved = normalizeBackendAgentId(match[1]);
        if (resolved) {
            last = resolved;
        }
    }
    return last;
}

/**
 * Pick the agent for a new turn: `@mention` in this message beats the picker, then stored/default.
 */
export function resolveBackendAgentForTurn(
    userContent: string,
    agents: readonly QaapAgentTaskAgentOption[],
    options: {
        readonly explicitAgentId?: string;
        readonly storedAgentId?: string;
        readonly defaultAgentId?: string;
        readonly conversationAgentId?: string;
    },
): string {
    const ids = new Set(agents.map(agent => agent.id));
    const mentioned = extractBackendAgentMention(userContent);
    if (mentioned) {
        return mentioned;
    }
    const explicit = resolveAgentOptionId(options.explicitAgentId, agents);
    if (explicit && (ids.has(explicit) || normalizeBackendAgentId(explicit))) {
        return explicit;
    }
    const fromConversation = resolveAgentOptionId(options.conversationAgentId, agents);
    if (fromConversation && (ids.has(fromConversation) || normalizeBackendAgentId(fromConversation))) {
        return fromConversation;
    }
    return reconcileSelectedAgent(
        migrateQaapProductAgentId(options.storedAgentId),
        agents,
        options.defaultAgentId,
        undefined,
    );
}

/** Accept built-ins by alias and custom server agents by exact id. */
export function resolveAgentOptionId(agentId: string | undefined, agents: readonly QaapAgentTaskAgentOption[]): string | undefined {
    const trimmed = agentId?.trim();
    if (!trimmed) {
        return undefined;
    }
    const exact = agents.find(agent => agent.id.toLowerCase() === trimmed.toLowerCase());
    if (exact) {
        return exact.id;
    }
    return normalizeBackendAgentId(trimmed) ?? migrateLegacyBackendAgentId(trimmed);
}

export async function fetchAgentTaskListAll(): Promise<QaapAgentTaskListSnapshot> {
    const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/all`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    return parseAgentTaskListBody(await response.json());
}

export async function fetchAgentModelsForAgent(agentId: string): Promise<QaapQaiqModelOption[]> {
    const response = await fetch(
        `${QAAP_AGENT_TASK_API_PATH}/agent-models?agent=${encodeURIComponent(agentId)}`,
        { credentials: 'include' },
    );
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    const body = await response.json() as { models?: QaapQaiqModelOption[] };
    return body.models ?? [];
}

export async function fetchAgentTaskList(cwd?: string): Promise<QaapAgentTaskListSnapshot> {
    const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : '';
    const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}${query}`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    return parseAgentTaskListBody(await response.json());
}

function parseAgentTaskListBody(body: {
    agents?: QaapAgentTaskAgentOption[];
    agentConfigured?: boolean;
    defaultAgent?: string;
    qaiqModels?: QaapQaiqModelOption[];
}): QaapAgentTaskListSnapshot {
    const agents = [...(body.agents ?? [])];
    if (agents.length === 0) {
        agents.push(shellAgentFallback());
    }
    return {
        agents,
        agentConfigured: body.agentConfigured === true,
        defaultAgent: body.defaultAgent,
        qaiqModels: body.qaiqModels ?? [],
    };
}

export async function createAgentTask(body: QaapCreateAgentTaskBody): Promise<QaapAgentTaskCreated> {
    const response = await fetch(QAAP_AGENT_TASK_API_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    return response.json() as Promise<QaapAgentTaskCreated>;
}

export async function fetchAgentTaskDetail(id: string): Promise<QaapAgentTaskDetailDTO> {
    const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    return response.json() as Promise<QaapAgentTaskDetailDTO>;
}

export async function cancelAgentTask(id: string): Promise<void> {
    const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(response.statusText);
    }
}

export function hashString(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash) + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}
