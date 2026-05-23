// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon, Message, ReactWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    buildCreateAgentTaskBody,
    cancelAgentTask,
    createAgentTask,
    reconcileSelectedAgent,
    SHELL_AGENT_ID,
    writeStoredAgent,
} from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';
import {
    QAAP_AGENT_TASK_API_PATH,
    type QaapAgentDescriptor,
    type QaapAgentTask,
    type QaapAgentTaskDetail,
} from '../common/qaap-agent-task';

const POLL_INTERVAL_MS = 3000;

/**
 * Launch and monitor background tasks that run on the VPS independently of this tab.
 * Start a task here, lock the phone, and a Web Push announces the result when it finishes.
 */
@injectable()
export class QaapAgentTasksWidget extends ReactWidget {

    static readonly ID = 'qaap-agent-tasks';
    static readonly LABEL = nls.localize('qaap/agentTasks/label', 'Background tasks');

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    protected tasks: QaapAgentTask[] = [];
    protected commandDraft = '';
    protected expandedId: string | undefined;
    protected expandedLog = '';
    protected busy = false;
    protected pollHandle: number | undefined;
    /** Absolute path of the current project — tasks are scoped to it. */
    protected projectCwd: string | undefined;
    protected agentConfigured = false;
    protected agents: QaapAgentDescriptor[] = [];
    /** User's current pick, or `undefined` until the server's defaultAgent arrives. */
    protected selectedAgent: string | undefined;

    @postConstruct()
    protected init(): void {
        this.id = QaapAgentTasksWidget.ID;
        this.title.label = QaapAgentTasksWidget.LABEL;
        this.title.caption = QaapAgentTasksWidget.LABEL;
        this.title.iconClass = codicon('server-process');
        this.title.closable = true;
        this.addClass('qaap-agent-tasks');
        void this.refresh();
    }

    protected override onAfterAttach(message: Message): void {
        super.onAfterAttach(message);
        this.pollHandle = window.setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    }

    protected override onBeforeDetach(message: Message): void {
        if (this.pollHandle !== undefined) {
            window.clearInterval(this.pollHandle);
            this.pollHandle = undefined;
        }
        super.onBeforeDetach(message);
    }

    protected async refresh(): Promise<void> {
        try {
            if (!this.projectCwd) {
                this.projectCwd = await this.resolveCwd();
            }
            const query = this.projectCwd ? `?cwd=${encodeURIComponent(this.projectCwd)}` : '';
            const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}${query}`, { credentials: 'include' });
            if (response.ok) {
                const body = await response.json() as {
                    tasks?: QaapAgentTask[];
                    agentConfigured?: boolean;
                    agents?: QaapAgentDescriptor[];
                    defaultAgent?: string;
                };
                this.tasks = body.tasks ?? [];
                this.agentConfigured = body.agentConfigured === true;
                this.agents = body.agents ?? [];
                this.selectedAgent = reconcileSelectedAgent(
                    this.selectedAgent,
                    this.agents,
                    body.defaultAgent,
                    this.projectCwd,
                );
            }
            if (this.expandedId) {
                await this.loadLog(this.expandedId);
            }
        } catch {
            /* keep last known state */
        }
        this.update();
    }

    protected async loadLog(id: string): Promise<void> {
        try {
            const response = await fetch(`${QAAP_AGENT_TASK_API_PATH}/${encodeURIComponent(id)}`, { credentials: 'include' });
            if (response.ok) {
                this.expandedLog = (await response.json() as QaapAgentTaskDetail).log ?? '';
            }
        } catch {
            /* keep last log */
        }
    }

    protected async resolveCwd(): Promise<string | undefined> {
        const root = this.workspaceService.tryGetRoots()[0];
        return root ? this.fileService.fsPath(root.resource) : undefined;
    }

    protected render(): React.ReactNode {
        const showBanner = !this.agentConfigured || this.selectedAgent === SHELL_AGENT_ID;
        return (
            <div className='qaap-agent-tasks-body'>
                {showBanner && (
                    <div className='qaap-agent-tasks-banner'>
                        {this.agentConfigured
                            ? nls.localize(
                                'qaap/agentTasks/shellMode',
                                'Shell mode — input runs verbatim as a command. Pick an agent above to send prompts instead.',
                            )
                            : nls.localize(
                                'qaap/agentTasks/noAgent',
                                'No coding agent detected on the server. Install one of: claude, codex, aider — or set QAAP_AGENT_COMMAND.',
                            )}
                    </div>
                )}
                {this.renderLauncher()}
                <div className='qaap-agent-tasks-list'>
                    {this.tasks.length === 0
                        ? <div className='qaap-agent-tasks-empty'>
                            {nls.localize('qaap/agentTasks/empty', 'No background tasks yet. Start one above.')}
                        </div>
                        : this.tasks.map(task => this.renderTask(task))}
                </div>
            </div>
        );
    }

    protected renderLauncher(): React.ReactNode {
        const usingShell = this.selectedAgent === SHELL_AGENT_ID;
        return (
            <div className='qaap-agent-tasks-launcher'>
                {this.agents.length > 1 && (
                    <select
                        className='qaap-agent-tasks-agent'
                        value={this.selectedAgent ?? ''}
                        disabled={this.busy}
                        onChange={this.onAgentChange}
                        aria-label={nls.localize('qaap/agentTasks/agentLabel', 'Agent')}
                    >
                        {this.agents.map(agent => (
                            <option key={agent.id} value={agent.id}>{agent.label}</option>
                        ))}
                    </select>
                )}
                <input
                    className='qaap-agent-tasks-input'
                    type='text'
                    placeholder={usingShell
                        ? nls.localize('qaap/agentTasks/placeholderCommand', 'Command to run in the background…')
                        : nls.localize('qaap/agentTasks/placeholderAgent', 'Describe a task for the agent…')}
                    value={this.commandDraft}
                    disabled={this.busy}
                    onChange={this.onDraftChange}
                    onKeyDown={this.onDraftKeyDown}
                />
                <button
                    type='button'
                    className='qaap-agent-tasks-run'
                    disabled={this.busy || this.commandDraft.trim().length === 0}
                    onClick={this.onRun}
                >
                    {nls.localize('qaap/agentTasks/run', 'Run')}
                </button>
            </div>
        );
    }

    protected renderTask(task: QaapAgentTask): React.ReactNode {
        const expanded = task.id === this.expandedId;
        return (
            <div key={task.id} className='qaap-agent-tasks-item'>
                <div className='qaap-agent-tasks-row' onClick={() => this.toggleExpanded(task.id)}>
                    <span className={`qaap-agent-tasks-state qaap-agent-tasks-state--${task.state}`}>
                        {this.stateLabel(task)}
                    </span>
                    <span className='qaap-agent-tasks-title' title={task.command}>
                        {task.parentId && <span className='qaap-agent-tasks-child-marker' aria-hidden='true'>↳ </span>}
                        {task.title}
                    </span>
                    {task.state === 'running' && (
                        <button
                            type='button'
                            className='qaap-agent-tasks-cancel'
                            title={nls.localize('qaap/agentTasks/cancel', 'Cancel')}
                            onClick={event => this.onCancel(event, task.id)}
                        >
                            <i className={codicon('stop-circle')} />
                        </button>
                    )}
                    <i className={`qaap-agent-tasks-chevron ${codicon(expanded ? 'chevron-down' : 'chevron-right')}`} />
                </div>
                {expanded && (
                    <pre className='qaap-agent-tasks-log'>
                        {this.expandedLog || nls.localize('qaap/agentTasks/noOutput', '(no output yet)')}
                    </pre>
                )}
            </div>
        );
    }

    protected stateLabel(task: QaapAgentTask): string {
        switch (task.state) {
            case 'running': return nls.localize('qaap/agentTasks/stateRunning', 'Running');
            case 'completed': return nls.localize('qaap/agentTasks/stateCompleted', 'Done');
            case 'failed': return nls.localize('qaap/agentTasks/stateFailed', 'Failed');
            case 'cancelled': return nls.localize('qaap/agentTasks/stateCancelled', 'Cancelled');
            case 'interrupted': return nls.localize('qaap/agentTasks/stateInterrupted', 'Interrupted');
        }
    }

    protected toggleExpanded(id: string): void {
        if (this.expandedId === id) {
            this.expandedId = undefined;
            this.expandedLog = '';
            this.update();
            return;
        }
        this.expandedId = id;
        this.expandedLog = '';
        this.update();
        void this.loadLog(id).then(() => this.update());
    }

    protected readonly onDraftChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        this.commandDraft = event.target.value;
        this.update();
    };

    protected readonly onAgentChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
        this.selectedAgent = event.target.value;
        writeStoredAgent(this.projectCwd, event.target.value);
        this.update();
    };

    protected readonly onDraftKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
        if (event.key === 'Enter') {
            void this.onRun();
        }
    };

    protected readonly onRun = async (): Promise<void> => {
        const draft = this.commandDraft.trim();
        if (!draft || this.busy) {
            return;
        }
        const cwd = await this.resolveCwd();
        if (!cwd) {
            return;
        }
        const agent = this.selectedAgent ?? SHELL_AGENT_ID;
        const body = buildCreateAgentTaskBody(draft, agent, cwd);
        this.busy = true;
        this.update();
        try {
            await createAgentTask(body);
            this.commandDraft = '';
        } catch {
            /* surfaced by the next refresh */
        } finally {
            this.busy = false;
            await this.refresh();
        }
    };

    protected readonly onCancel = (event: React.MouseEvent, id: string): void => {
        event.stopPropagation();
        void cancelAgentTask(id).then(() => this.refresh());
    };
}
