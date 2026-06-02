// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { codicon, Message, ReactWidget } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    createConversation,
    getConversation,
    type QaapAgentConversationSummaryDTO,
} from '@theia/qaap-mobile-shell/lib/common/qaap-agent-conversation-client';
import { filterVpsTaskSummaries } from '@theia/qaap-mobile-shell/lib/common/qaap-work-hub-surfaces';
import {
    buildCreateAgentTaskBody,
    cancelAgentTask,
    createAgentTask,
    reconcileSelectedAgent,
    resolveStoredQaiqModelForAgent,
    SHELL_AGENT_ID,
    writeStoredAgent,
} from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';
import { MobileProjectsActiveTasks, type MobileProjectTaskView } from '@theia/qaap-mobile-shell/lib/browser/mobile-projects-active-tasks';
import { MobileProjectsConversations } from '@theia/qaap-mobile-shell/lib/browser/mobile-projects-conversations';

/**
 * Desktop Work Hub parity — VPS agent conversations plus background CLI tasks for the
 * active workspace. Live updates use the same SSE feeds as the mobile Work Hub.
 */
@injectable()
export class QaapAgentTasksWidget extends ReactWidget {

    static readonly ID = 'qaap-agent-tasks';
    static readonly LABEL = nls.localize('qaap/agentTasks/label', 'Tasks');

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MobileProjectsActiveTasks)
    protected readonly activeTasks: MobileProjectsActiveTasks;

    @inject(MobileProjectsConversations)
    protected readonly conversations: MobileProjectsConversations;

    protected commandDraft = '';
    protected expandedTaskId: string | undefined;
    protected expandedTaskLog = '';
    protected expandedConversationId: string | undefined;
    protected expandedConversationBody = '';
    protected busy = false;
    protected projectCwd: string | undefined;
    protected selectedAgent: string | undefined;
    protected streamDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.id = QaapAgentTasksWidget.ID;
        this.title.label = QaapAgentTasksWidget.LABEL;
        this.title.caption = QaapAgentTasksWidget.LABEL;
        this.title.iconClass = codicon('server-process');
        this.title.closable = true;
        this.addClass('qaap-agent-tasks');
        void this.ensureProjectCwd();
    }

    protected override onAfterAttach(message: Message): void {
        super.onAfterAttach(message);
        this.streamDispose.dispose();
        this.streamDispose = new DisposableCollection();
        this.activeTasks.start();
        this.conversations.start();
        this.streamDispose.push(this.activeTasks.onDidChange(() => this.update()));
        this.streamDispose.push(this.conversations.onDidChange(() => this.update()));
        void this.ensureProjectCwd().then(() => this.update());
    }

    protected override onBeforeDetach(message: Message): void {
        this.streamDispose.dispose();
        super.onBeforeDetach(message);
    }

    protected async ensureProjectCwd(): Promise<string | undefined> {
        if (!this.projectCwd) {
            this.projectCwd = await this.resolveCwd();
        }
        if (this.projectCwd && !this.selectedAgent) {
            this.selectedAgent = reconcileSelectedAgent(
                undefined,
                this.activeTasks.getAgents(),
                this.activeTasks.getDefaultAgent(),
                this.projectCwd,
            );
        }
        return this.projectCwd;
    }

    protected async resolveCwd(): Promise<string | undefined> {
        const root = this.workspaceService.tryGetRoots()[0];
        return root ? this.fileService.fsPath(root.resource) : undefined;
    }

    protected vpsConversations(): QaapAgentConversationSummaryDTO[] {
        const cwd = this.projectCwd;
        if (!cwd) {
            return [];
        }
        return filterVpsTaskSummaries(this.conversations.getConversationsForCwd(cwd));
    }

    protected backgroundTasks(): MobileProjectTaskView[] {
        const cwd = this.projectCwd;
        if (!cwd) {
            return [];
        }
        return this.activeTasks.getTasksForCwd(cwd);
    }

    protected render(): React.ReactNode {
        const agents = this.activeTasks.getAgents();
        const agentConfigured = this.activeTasks.isAgentConfigured();
        const showBanner = !agentConfigured || this.selectedAgent === SHELL_AGENT_ID;
        const conversations = this.vpsConversations();
        const tasks = this.backgroundTasks();
        return (
            <div className='qaap-agent-tasks-body'>
                {showBanner && (
                    <div className='qaap-agent-tasks-banner'>
                        {agentConfigured
                            ? nls.localize(
                                'qaap/agentTasks/shellMode',
                                'Shell mode — input runs verbatim as a command. Pick an agent above to send prompts instead.',
                            )
                            : nls.localize(
                                'qaap/agentTasks/noAgent',
                                'No server-side coding agent detected. Install qaiq, claude, codex, opencode, goose, hermes, openclaw, cursor-agent, or aider; or configure QAAP_AGENT_COMMANDS / QAAP_AGENT_COMMAND.',
                            )}
                    </div>
                )}
                {!this.projectCwd && (
                    <div className='qaap-agent-tasks-banner'>
                        {nls.localize('qaap/agentTasks/noWorkspace', 'Open a workspace folder to delegate VPS tasks.')}
                    </div>
                )}
                {this.renderLauncher(agents)}
                {this.renderConversationSection(conversations)}
                {this.renderBackgroundTaskSection(tasks)}
            </div>
        );
    }

    protected renderLauncher(agents: ReturnType<MobileProjectsActiveTasks['getAgents']>): React.ReactNode {
        const usingShell = this.selectedAgent === SHELL_AGENT_ID;
        return (
            <div className='qaap-agent-tasks-launcher'>
                {agents.length > 1 && (
                    <select
                        className='qaap-agent-tasks-agent'
                        value={this.selectedAgent ?? ''}
                        disabled={this.busy || !this.projectCwd}
                        onChange={this.onAgentChange}
                        aria-label={nls.localize('qaap/agentTasks/agentLabel', 'Agent')}
                    >
                        {agents.map(agent => (
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
                    disabled={this.busy || !this.projectCwd}
                    onChange={this.onDraftChange}
                    onKeyDown={this.onDraftKeyDown}
                />
                <button
                    type='button'
                    className='qaap-agent-tasks-run'
                    disabled={this.busy || !this.projectCwd || this.commandDraft.trim().length === 0}
                    onClick={this.onRun}
                >
                    {nls.localize('qaap/agentTasks/run', 'Run')}
                </button>
            </div>
        );
    }

    protected renderConversationSection(conversations: QaapAgentConversationSummaryDTO[]): React.ReactNode {
        return (
            <section className='qaap-agent-tasks-section'>
                <div className='qaap-agent-tasks-section-head'>
                    <span className='qaap-agent-tasks-section-label'>
                        {nls.localize('qaap/agentTasks/conversationsSection', 'Agent conversations')}
                    </span>
                    <span className='qaap-agent-tasks-section-count'>{String(conversations.length)}</span>
                </div>
                <div className='qaap-agent-tasks-list'>
                    {conversations.length === 0
                        ? <div className='qaap-agent-tasks-empty'>
                            {nls.localize(
                                'qaap/agentTasks/conversationsEmpty',
                                'No VPS agent threads yet. Delegate work above — it keeps running when you close the app.',
                            )}
                        </div>
                        : conversations.map(conversation => this.renderConversation(conversation))}
                </div>
            </section>
        );
    }

    protected renderBackgroundTaskSection(tasks: MobileProjectTaskView[]): React.ReactNode {
        return (
            <section className='qaap-agent-tasks-section'>
                <div className='qaap-agent-tasks-section-head'>
                    <span className='qaap-agent-tasks-section-label'>
                        {nls.localize('qaap/agentTasks/backgroundSection', 'Background commands')}
                    </span>
                    <span className='qaap-agent-tasks-section-count'>{String(tasks.length)}</span>
                </div>
                <div className='qaap-agent-tasks-list'>
                    {tasks.length === 0
                        ? <div className='qaap-agent-tasks-empty'>
                            {nls.localize('qaap/agentTasks/backgroundEmpty', 'No shell background tasks yet.')}
                        </div>
                        : tasks.map(task => this.renderTask(task))}
                </div>
            </section>
        );
    }

    protected renderConversation(conversation: QaapAgentConversationSummaryDTO): React.ReactNode {
        const expanded = conversation.id === this.expandedConversationId;
        return (
            <div key={conversation.id} className='qaap-agent-tasks-item'>
                <div className='qaap-agent-tasks-row' onClick={() => void this.toggleConversation(conversation.id)}>
                    <span className={`qaap-agent-tasks-state qaap-agent-tasks-state--${conversation.status}`}>
                        {this.conversationStateLabel(conversation.status)}
                    </span>
                    <span className='qaap-agent-tasks-title' title={conversation.title}>
                        {conversation.title}
                    </span>
                    <i className={`qaap-agent-tasks-chevron ${codicon(expanded ? 'chevron-down' : 'chevron-right')}`} />
                </div>
                {expanded && (
                    <pre className='qaap-agent-tasks-log'>
                        {this.expandedConversationBody || nls.localize('qaap/agentTasks/noOutput', '(no output yet)')}
                    </pre>
                )}
            </div>
        );
    }

    protected renderTask(task: MobileProjectTaskView): React.ReactNode {
        const expanded = task.id === this.expandedTaskId;
        return (
            <div key={task.id} className='qaap-agent-tasks-item'>
                <div className='qaap-agent-tasks-row' onClick={() => this.toggleTask(task.id)}>
                    <span className={`qaap-agent-tasks-state qaap-agent-tasks-state--${task.state}`}>
                        {this.stateLabel(task.state)}
                    </span>
                    <span className='qaap-agent-tasks-title' title={task.command ?? task.title}>
                        {'parentId' in task && task.parentId && (
                            <span className='qaap-agent-tasks-child-marker' aria-hidden='true'>↳ </span>
                        )}
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
                        {this.expandedTaskLog || nls.localize('qaap/agentTasks/noOutput', '(no output yet)')}
                    </pre>
                )}
            </div>
        );
    }

    protected conversationStateLabel(status: QaapAgentConversationSummaryDTO['status']): string {
        switch (status) {
            case 'streaming': return nls.localize('qaap/agentTasks/stateRunning', 'Running');
            case 'failed': return nls.localize('qaap/agentTasks/stateFailed', 'Failed');
            default: return nls.localize('qaap/agentTasks/stateIdle', 'Idle');
        }
    }

    protected stateLabel(state: string): string {
        switch (state) {
            case 'running': return nls.localize('qaap/agentTasks/stateRunning', 'Running');
            case 'completed': return nls.localize('qaap/agentTasks/stateCompleted', 'Done');
            case 'failed': return nls.localize('qaap/agentTasks/stateFailed', 'Failed');
            case 'cancelled': return nls.localize('qaap/agentTasks/stateCancelled', 'Cancelled');
            case 'interrupted': return nls.localize('qaap/agentTasks/stateInterrupted', 'Interrupted');
            default: return state;
        }
    }

    protected toggleTask(id: string): void {
        if (this.expandedTaskId === id) {
            this.expandedTaskId = undefined;
            this.expandedTaskLog = '';
            this.update();
            return;
        }
        this.expandedTaskId = id;
        this.expandedTaskLog = '';
        this.expandedConversationId = undefined;
        this.expandedConversationBody = '';
        this.update();
        void this.loadTaskLog(id).then(() => this.update());
    }

    protected async toggleConversation(id: string): Promise<void> {
        if (this.expandedConversationId === id) {
            this.expandedConversationId = undefined;
            this.expandedConversationBody = '';
            this.update();
            return;
        }
        this.expandedConversationId = id;
        this.expandedConversationBody = '';
        this.expandedTaskId = undefined;
        this.expandedTaskLog = '';
        this.update();
        try {
            const conversation = await getConversation(id);
            this.expandedConversationBody = conversation.messages
                .map(message => `${message.role === 'user' ? 'You' : 'Agent'}: ${message.content}`)
                .join('\n\n');
        } catch {
            this.expandedConversationBody = nls.localize('qaap/agentTasks/conversationLoadFailed', 'Could not load conversation.');
        }
        this.update();
    }

    protected async loadTaskLog(id: string): Promise<void> {
        try {
            const response = await fetch(`/qaap/api/agent-tasks/${encodeURIComponent(id)}`, { credentials: 'include' });
            if (response.ok) {
                this.expandedTaskLog = (await response.json() as { log?: string }).log ?? '';
            }
        } catch {
            /* keep last log */
        }
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
        const cwd = await this.ensureProjectCwd();
        if (!draft || this.busy || !cwd) {
            return;
        }
        const agent = this.selectedAgent ?? SHELL_AGENT_ID;
        this.busy = true;
        this.update();
        try {
            if (agent === SHELL_AGENT_ID) {
                const body = buildCreateAgentTaskBody(draft, agent, cwd);
                await createAgentTask(body);
            } else {
                const qaiqModel = resolveStoredQaiqModelForAgent(agent, cwd);
                await createConversation({
                    cwd,
                    agent,
                    title: draft,
                    message: draft,
                    ...(qaiqModel ? { qaiqModel } : {}),
                });
            }
            this.commandDraft = '';
        } catch {
            /* surfaced by the next SSE refresh */
        } finally {
            this.busy = false;
            this.update();
        }
    };

    protected readonly onCancel = (event: React.MouseEvent, id: string): void => {
        event.stopPropagation();
        void cancelAgentTask(id);
    };
}
