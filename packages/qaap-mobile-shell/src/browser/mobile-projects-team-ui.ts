// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { resolveLeaderTaskIdFromMessages } from '../common/qaap-agent-task-tree';
import type { QaapAgentConversationDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectTaskView } from './mobile-projects-active-tasks';

export interface MobileProjectsTeamUiDeps {
    getChildTasks(parentId: string): MobileProjectTaskView[];
    onSubtaskClick?(taskId: string): void;
}

/** Renders leader/subtask rows in the transcript — lightweight Team Mode (no ACP). */
export class MobileProjectsTeamUi {

    constructor(protected readonly deps: MobileProjectsTeamUiDeps) { }

    /** Insert or refresh the team block inside the transcript chat host. */
    renderTeamSection(chatHost: HTMLElement, conv: QaapAgentConversationDTO): void {
        const leaderTaskId = resolveLeaderTaskIdFromMessages(conv.messages);
        const children = leaderTaskId ? this.deps.getChildTasks(leaderTaskId) : [];
        const existing = chatHost.querySelector(':scope > .theia-mobile-transcript-team');
        if (children.length === 0) {
            existing?.remove();
            return;
        }
        const section = existing instanceof HTMLElement ? existing : document.createElement('section');
        section.className = 'theia-mobile-transcript-team';
        section.replaceChildren();
        const head = document.createElement('div');
        head.className = 'theia-mobile-transcript-team-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-transcript-team-label';
        label.textContent = nls.localize('qaap/mobileProjects/teamHeading', 'Team');
        const count = document.createElement('span');
        count.className = 'theia-mobile-transcript-team-count';
        count.textContent = String(children.length);
        head.append(label, count);
        section.append(head);
        const list = document.createElement('div');
        list.className = 'theia-mobile-transcript-team-list';
        for (const child of children) {
            list.append(this.createTeamRow(child));
        }
        section.append(list);
        if (!existing) {
            const messageHost = chatHost.querySelector(':scope > .theia-mobile-agent-transcript');
            if (messageHost instanceof HTMLElement) {
                chatHost.insertBefore(section, messageHost);
            } else {
                chatHost.prepend(section);
            }
        }
    }

    protected createTeamRow(task: MobileProjectTaskView): HTMLElement {
        const interactive = !!this.deps.onSubtaskClick;
        const row = document.createElement(interactive ? 'button' : 'div');
        row.className = 'theia-mobile-transcript-team-row';
        if (interactive) {
            (row as HTMLButtonElement).type = 'button';
            row.setAttribute(
                'aria-label',
                nls.localize('qaap/mobileProjects/teamSubtaskOpenLog', 'Open subtask log: {0}', task.title),
            );
        }
        const dot = document.createElement('span');
        dot.className = `theia-mobile-transcript-team-dot theia-mod-${this.stateClass(task.state)}`;
        dot.setAttribute('aria-hidden', 'true');
        const body = document.createElement('div');
        body.className = 'theia-mobile-transcript-team-body';
        const title = document.createElement('div');
        title.className = 'theia-mobile-transcript-team-title';
        title.textContent = task.title;
        const meta = document.createElement('div');
        meta.className = 'theia-mobile-transcript-team-meta';
        meta.textContent = this.stateLabel(task.state);
        body.append(title, meta);
        row.append(dot, body);
        if (interactive) {
            row.addEventListener('click', () => this.deps.onSubtaskClick?.(task.id));
        }
        return row;
    }

    protected stateClass(state: string): string {
        if (state === 'running') {
            return 'running';
        }
        if (state === 'completed') {
            return 'done';
        }
        if (state === 'failed' || state === 'interrupted') {
            return 'failed';
        }
        return 'idle';
    }

    protected stateLabel(state: string): string {
        switch (state) {
            case 'running':
                return nls.localize('qaap/mobileProjects/teamStateRunning', 'Running');
            case 'completed':
                return nls.localize('qaap/mobileProjects/teamStateDone', 'Done');
            case 'failed':
                return nls.localize('qaap/mobileProjects/teamStateFailed', 'Failed');
            case 'interrupted':
                return nls.localize('qaap/mobileProjects/teamStateInterrupted', 'Interrupted');
            case 'cancelled':
                return nls.localize('qaap/mobileProjects/teamStateCancelled', 'Cancelled');
            default:
                return state;
        }
    }
}
