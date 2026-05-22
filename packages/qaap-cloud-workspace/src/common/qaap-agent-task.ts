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
}

/** A task plus its captured stdout/stderr log. */
export interface QaapAgentTaskDetail extends QaapAgentTask {
    readonly log: string;
}

export interface QaapCreateAgentTaskRequest {
    readonly title?: string;
    /** A raw shell command to run. Provide this OR {@link prompt}. */
    readonly command?: string;
    /**
     * A natural-language task for the coding agent. The backend wraps it with the agent CLI
     * configured via the QAAP_AGENT_COMMAND environment variable (a template with a {prompt}
     * placeholder). With no agent configured the prompt is run verbatim as a command.
     */
    readonly prompt?: string;
    readonly cwd: string;
}

export interface QaapAgentTaskListResponse {
    readonly tasks: QaapAgentTask[];
    /**
     * True when QAAP_AGENT_COMMAND is set — i.e. a prompt launches a real coding agent.
     * When false, a prompt is run verbatim as a shell command.
     */
    readonly agentConfigured: boolean;
}

/** True once the task has stopped and will not change state again. */
export function isQaapAgentTaskFinished(state: QaapAgentTaskState): boolean {
    return state !== 'running';
}
