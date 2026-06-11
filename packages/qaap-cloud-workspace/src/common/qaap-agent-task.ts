// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** HTTP base path for the background agent-task endpoints. */
export const QAAP_AGENT_TASK_API_PATH = '/qaap/api/agent-tasks';

export type QaapAgentTaskState =
    /** The process is still running on the VPS. */
    | 'running'
    /** Finished with exit code 0. */
    | 'completed'
    /** Finished with a non-zero exit code or failed to start. */
    | 'failed'
    /** The process was lost (e.g. the backend restarted while it ran). */
    | 'interrupted'
    /** Cancelled by the user. */
    | 'cancelled';

/** A background task running independently of any browser tab. */
export interface QaapAgentTask {
    readonly id: string;
    readonly title: string;
    readonly command: string;
    /** Absolute working directory the command runs in. */
    readonly cwd: string;
    readonly state: QaapAgentTaskState;
    readonly exitCode?: number;
    /** Epoch milliseconds. */
    readonly createdAt: number;
    readonly finishedAt?: number;
    /**
     * Id of the task that spawned this one — set when an agent calls the `qaap-task` helper.
     * Lets the UI render sub-tasks under their parent.
     */
    readonly parentId?: string;
    /** Whether skip-permission flags were applied when the CLI was spawned. */
    readonly autoApprove?: boolean;
    /** Model the user picked in the mobile agent sheet (provider + vendor + modelId). */
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. Kept for persisted tasks and older clients. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
}

/** A task plus its captured stdout/stderr log. */
export interface QaapAgentTaskDetail extends QaapAgentTask {
    readonly log: string;
}

/** Picker selection on create-task / create-conversation requests (accepts legacy `qaiqModel`). */
export function resolveRequestAgentModel(request: {
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
}): QaapCreateAgentTaskQaiqModel | undefined {
    return request.agentModel ?? request.qaiqModel;
}

export function resolveTaskAgentModel(task: {
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
}): QaapCreateAgentTaskQaiqModel | undefined {
    return task.agentModel ?? task.qaiqModel;
}

export interface QaapCreateAgentTaskRequest {
    readonly title?: string;
    /** A raw shell command to run. Provide this OR {@link prompt}. */
    readonly command?: string;
    /**
     * A natural-language task for the coding agent. The backend wraps it with the selected
     * agent ({@link agent}), the QAAP_AGENT_COMMAND env template, or — as a last resort —
     * runs the prompt verbatim as a shell command.
     */
    readonly prompt?: string;
    /**
     * Id of an agent returned by the list endpoint, e.g. `'claude'`, `'codex'`, `'aider'`,
     * `'opencode'`, `'goose'`, `'hermes'`, `'openclaw'`, `'cursor'`, `'gemini'`, `'copilot'`, `'qwen'`, `'kimi'`,
     * or a custom id configured through `QAAP_AGENT_COMMANDS`. Use the special value `'shell'`
     * to bypass any agent and run the prompt verbatim as a command.
     */
    readonly agent?: string;
    /** Optional model selected from the frontend picker (any VPS agent). */
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    /** @deprecated Use {@link agentModel}. */
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
    readonly cwd: string;
    /**
     * Resolved cross-project context (the editable `qaap-tasks-background-context` fragment),
     * prepended to the agent prompt by the runner ahead of the per-project `project-info` it reads
     * from {@link cwd}. The frontend resolves this because the backend has no PromptService.
     */
    readonly contextPreamble?: string;
    /** Forwarded by the `qaap-task` helper so spawned tasks attribute to their parent. */
    readonly parentId?: string;
    /**
     * YOLO / full-auto mode — inject skip-permission flags into the agent CLI. Defaults to on
     * for background tasks; set `false` to require manual CLI approval (will hang if unattended).
     */
    readonly autoApprove?: boolean;
    /** Composer interaction mode for QAIQ (`agent`, `plan`, `ask`). */
    readonly interactionModeId?: string;
    /** Composer approval preset (`request-approval`, `approve-for-me`, `full-access`). */
    readonly approvalPolicyId?: string;
    /** Optional scopes under {@code approve-for-me} (shell / network). */
    readonly toolApprovalRules?: import('./qaap-agent-conversation').QaapAgentToolApprovalRules;
}

/** A coding agent the runner knows how to invoke. */
export interface QaapAgentDescriptor {
    /** Stable identifier sent back in {@link QaapCreateAgentTaskRequest.agent}. */
    readonly id: string;
    /** Human-readable label for the picker. */
    readonly label: string;
    /** True when the agent's CLI was detected on the server's PATH (or env template is set). */
    readonly available: boolean;
}

/** Selectable QAIQ model option exposed to the frontend picker. */
export interface QaapQaiqModelOption {
    readonly provider: 'openai' | 'gemini' | 'ollama' | 'anthropic' | 'mistral';
    readonly vendor: string;
    readonly modelId: string;
    readonly label: string;
}

/** QAIQ model binding selected by the user in the agent picker submenu. */
export interface QaapCreateAgentTaskQaiqModel {
    readonly provider: 'openai' | 'gemini' | 'ollama' | 'anthropic' | 'mistral';
    readonly vendor: string;
    readonly modelId: string;
}

/** Result of a best-effort runner warm-up for a workspace cwd. */
export interface QaapAgentWarmResult {
    readonly cwd: string;
    readonly agentsReady: boolean;
    readonly projectInfoCached: boolean;
    readonly projectNameCached: boolean;
    readonly qaiqProbed: boolean;
}

export interface QaapAgentTaskListResponse {
    readonly tasks: QaapAgentTask[];
    /**
     * True when at least one agent is available — autodetected on the PATH or configured via
     * QAAP_AGENT_COMMAND. When false, a prompt is run verbatim as a shell command.
     */
    readonly agentConfigured: boolean;
    /** Agents available on the server, plus the always-present `'shell'` pseudo-agent. */
    readonly agents: QaapAgentDescriptor[];
    /** Id of the agent used when the request omits one (first available, else `'shell'`). */
    readonly defaultAgent: string;
    /** QAIQ model options available from configured provider settings grouped client-side by provider. */
    readonly qaiqModels?: QaapQaiqModelOption[];
}

/** All tasks the runner knows about, grouped by their working directory. */
export interface QaapAgentTaskCwdGroup {
    /** Absolute, normalized working directory the tasks ran in. */
    readonly cwd: string;
    /** Best-effort human-readable name (typically `package.json#name` or the dir basename). */
    readonly projectName: string;
    /** Number of tasks currently in the `'running'` state in this group. */
    readonly activeCount: number;
    /** Tasks for this cwd, newest first (same ordering as {@link QaapAgentTaskListResponse.tasks}). */
    readonly tasks: QaapAgentTask[];
}

export interface QaapAgentTaskAllResponse {
    /** One entry per distinct cwd known to the runner. */
    readonly groups: QaapAgentTaskCwdGroup[];
    readonly agentConfigured: boolean;
    readonly agents: QaapAgentDescriptor[];
    readonly defaultAgent: string;
    readonly qaiqModels?: QaapQaiqModelOption[];
}

/** Payload pushed over SSE when a task changes state. */
export type QaapAgentTaskEvent =
    | { readonly type: 'created' | 'completed' | 'cancelled'; readonly task: QaapAgentTask }
    | { readonly type: 'output'; readonly task: QaapAgentTask; readonly chunk: string };

/** True once the task has stopped and will not change state again. */
export function isQaapAgentTaskFinished(state: QaapAgentTaskState): boolean {
    return state !== 'running';
}
