// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import {
    buildCreateAgentTaskBody,
    createAgentTask,
    fetchAgentTaskListAll,
    filterUiSelectableVpsAgents,
    reconcileSelectedAgent,
    SHELL_AGENT_ID,
    writeStoredAgent,
    type QaapAgentTaskAgentOption,
    type QaapAgentTaskCreated,
} from '../common/qaap-agent-task-client';
import { createAgentSelectField } from './qaap-agent-ui';
import { MobileProjectEntry } from './mobile-projects-types';
import { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import { MobileSnackbar } from './mobile-snackbar';
import { QaapBackgroundContextProvider } from './qaap-background-context-provider';

export type { QaapAgentTaskCreated as MobileAgentTaskCreated };
export { scopedAgentStorageKey } from '../common/qaap-agent-task-client';

export interface MobileAgentTaskComposerDelegate {
    onSubmitted?(task: QaapAgentTaskCreated): void | Promise<void>;
}

/**
 * Dashboard-scoped mini composer. It talks to the same HTTP task API as the full workspace widget
 * but receives `cwd` from the project card, so launching work does not switch the active workspace.
 */
export class MobileAgentTaskComposer {

    readonly node: HTMLElement;
    protected readonly titleEl: HTMLElement;
    protected readonly banner: HTMLElement;
    protected readonly agentField: ReturnType<typeof createAgentSelectField>;
    protected readonly input: HTMLInputElement;
    protected readonly runBtn: HTMLButtonElement;
    protected readonly errorEl: HTMLElement;
    protected visible = false;
    protected busy = false;
    protected project: MobileProjectEntry | undefined;
    protected cwd: string | undefined;
    protected agents: QaapAgentTaskAgentOption[] = [];
    protected agentConfigured = false;
    protected selectedAgent: string | undefined;

    protected readonly onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape' && this.visible) {
            ev.stopPropagation();
            this.hide();
        }
    };

    constructor(
        protected readonly activeTasks: MobileProjectsActiveTasks | undefined,
        protected readonly delegate: MobileAgentTaskComposerDelegate = {},
        protected readonly contextProvider?: QaapBackgroundContextProvider,
    ) {
        this.node = document.createElement('div');
        this.node.className = 'theia-mobile-agent-composer';
        this.node.setAttribute('role', 'dialog');
        this.node.setAttribute('aria-modal', 'true');
        this.node.setAttribute('aria-hidden', 'true');
        this.node.hidden = true;

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-composer-backdrop';
        backdrop.addEventListener('click', () => this.hide());

        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-composer-sheet';

        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-composer-header';
        const titleWrap = document.createElement('div');
        titleWrap.className = 'theia-mobile-agent-composer-title-wrap';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-server-process';
        icon.setAttribute('aria-hidden', 'true');
        this.titleEl = document.createElement('h2');
        this.titleEl.className = 'theia-mobile-agent-composer-title';
        titleWrap.append(icon, this.titleEl);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-composer-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.hide());
        header.append(titleWrap, close);

        this.banner = document.createElement('p');
        this.banner.className = 'theia-mobile-agent-composer-banner';

        const row = document.createElement('div');
        row.className = 'theia-mobile-agent-composer-row';
        this.agentField = createAgentSelectField({
            className: 'theia-mobile-agent-composer-agent',
            ariaLabel: nls.localize('qaap/mobileAgentComposer/agent', 'Agent'),
            onChange: agentId => {
                this.selectedAgent = agentId;
                writeStoredAgent(this.cwd, agentId);
                this.renderState();
            },
        });
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'theia-mobile-agent-composer-input';
        this.input.addEventListener('input', () => this.renderState());
        this.input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') {
                void this.submit();
            }
        });
        this.runBtn = document.createElement('button');
        this.runBtn.type = 'button';
        this.runBtn.className = 'theia-mobile-agent-composer-run';
        this.runBtn.textContent = nls.localize('qaap/mobileAgentComposer/run', 'Run');
        this.runBtn.addEventListener('click', () => { void this.submit(); });
        row.append(this.agentField.root, this.input, this.runBtn);

        this.errorEl = document.createElement('p');
        this.errorEl.className = 'theia-mobile-agent-composer-error';
        sheet.append(header, this.banner, row, this.errorEl);
        this.node.append(backdrop, sheet);
    }

    async show(project: MobileProjectEntry, cwd: string | undefined, draft?: string): Promise<void> {
        this.project = project;
        this.cwd = cwd;
        this.input.value = draft ?? '';
        this.errorEl.textContent = '';
        await this.loadAgents();
        this.renderState();
        this.visible = true;
        this.node.hidden = false;
        this.node.setAttribute('aria-hidden', 'false');
        this.node.classList.add('theia-mod-visible');
        document.addEventListener('keydown', this.onKeyDown, true);
        window.setTimeout(() => this.input.focus(), 80);
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.visible = false;
        this.node.hidden = true;
        this.node.setAttribute('aria-hidden', 'true');
        this.node.classList.remove('theia-mod-visible');
        document.removeEventListener('keydown', this.onKeyDown, true);
    }

    dispose(): void {
        this.hide();
        this.node.remove();
    }

    protected async loadAgents(): Promise<void> {
        try {
            const snapshot = await fetchAgentTaskListAll();
            this.agentConfigured = snapshot.agentConfigured;
            this.agents = filterUiSelectableVpsAgents(snapshot.agents);
            this.selectedAgent = reconcileSelectedAgent(
                this.selectedAgent,
                this.agents,
                snapshot.defaultAgent ?? this.activeTasks?.getDefaultAgent(),
                this.cwd,
            );
        } catch {
            this.agentConfigured = this.activeTasks?.isAgentConfigured() ?? false;
            this.agents = filterUiSelectableVpsAgents(this.activeTasks?.getAgents() ?? []);
            this.selectedAgent = reconcileSelectedAgent(
                this.selectedAgent,
                this.agents,
                this.activeTasks?.getDefaultAgent(),
                this.cwd,
            );
        }
    }

    protected renderState(): void {
        const projectName = this.project?.name ?? nls.localize('qaap/mobileAgentComposer/projectFallback', 'Project');
        this.titleEl.textContent = nls.localize('qaap/mobileAgentComposer/title', 'Run task in {0}', projectName);

        this.agentField.setAgents(this.agents, this.selectedAgent ?? this.agents[0]?.id ?? SHELL_AGENT_ID);
        this.selectedAgent = this.agentField.getSelectedId();
        this.agentField.select.disabled = this.busy || this.agents.length <= 1;

        const usingShell = this.selectedAgent === SHELL_AGENT_ID;
        this.input.placeholder = usingShell
            ? nls.localize('qaap/mobileAgentComposer/placeholderCommand', 'Command to run in the background...')
            : nls.localize('qaap/mobileAgentComposer/placeholderAgent', 'Describe a task for the agent...');
        this.banner.textContent = !this.cwd
            ? nls.localize('qaap/mobileAgentComposer/noCwd', 'This project has not been cloned locally yet.')
            : this.agentConfigured || usingShell
                ? nls.localize('qaap/mobileAgentComposer/shellMode', 'Runs on the VPS without opening this workspace.')
                : nls.localize('qaap/mobileAgentComposer/noAgent', 'No coding agent detected on the server; shell mode will run commands verbatim.');

        this.input.disabled = this.busy || !this.cwd;
        this.runBtn.disabled = this.busy || !this.cwd || this.input.value.trim().length === 0;
    }

    protected async submit(): Promise<void> {
        const draft = this.input.value.trim();
        if (!draft || this.busy || !this.cwd) {
            return;
        }
        const agent = this.selectedAgent ?? SHELL_AGENT_ID;
        const contextPreamble = await this.contextProvider?.resolve();
        const body = buildCreateAgentTaskBody(draft, agent, this.cwd, contextPreamble);
        this.busy = true;
        this.errorEl.textContent = '';
        this.renderState();
        try {
            const task = await createAgentTask(body);
            this.activeTasks?.recordTaskCreated(task);
            this.input.value = '';
            this.hide();
            await this.delegate.onSubmitted?.(task);
            MobileSnackbar.show(
                nls.localize('qaap/mobileAgentComposer/started', 'Task started'),
                { kind: 'success', duration: 1400 }
            );
        } catch (error) {
            this.errorEl.textContent = error instanceof Error ? error.message : String(error);
        } finally {
            this.busy = false;
            this.renderState();
        }
    }
}
