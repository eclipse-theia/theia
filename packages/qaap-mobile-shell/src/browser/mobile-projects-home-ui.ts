// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import type {
    WorkHubHomeAttentionItem,
    WorkHubHomeRecentItem,
    WorkHubHomeSnapshot,
} from '../common/qaap-work-hub-home';
import type { MobileProjectEntry } from './mobile-projects-types';
import { mobileProjectInitials } from './mobile-projects-types';

export type WorkHubHomeNavigateTarget = 'home' | 'repos' | 'chat' | 'tasks' | 'review' | 'routines';

export type WorkHubHomeQuickActionId = 'new-chat' | 'delegate-task' | 'all-projects' | 'open-review';

export type WorkHubWorkspaceStatus = 'idle' | 'running' | 'open';

export interface MobileProjectsHomeUiDeps {
    getWorkspaceActivity(project: MobileProjectEntry): string;
    getWorkspaceStatus(project: MobileProjectEntry): WorkHubWorkspaceStatus;
    formatRelativeTime(updatedAt: number): string;
    onNavigate(target: WorkHubHomeNavigateTarget): void;
    onOpenProject(project: MobileProjectEntry): void;
    onOpenRecent(item: WorkHubHomeRecentItem): void;
    onOpenAttention(item: WorkHubHomeAttentionItem): void;
    onQuickAction(action: WorkHubHomeQuickActionId): void;
}

interface HomeShortcutSpec {
    readonly action: WorkHubHomeQuickActionId;
    readonly icon: string;
    readonly label: string;
    readonly hint: string;
}

export class MobileProjectsHomeUi {

    protected static readonly SHORTCUTS: readonly HomeShortcutSpec[] = [
        {
            action: 'new-chat',
            icon: 'codicon-comment-discussion',
            label: 'Capture',
            hint: 'Start from a task',
        },
        {
            action: 'delegate-task',
            icon: 'codicon-server-process',
            label: 'Delegate',
            hint: 'Agent to branch',
        },
        {
            action: 'open-review',
            icon: 'codicon-git-pull-request',
            label: 'PR review',
            hint: 'Diffs and checks',
        },
        {
            action: 'all-projects',
            icon: 'codicon-folder',
            label: 'Repos',
            hint: 'GitHub workspaces',
        },
    ];

    constructor(protected readonly deps: MobileProjectsHomeUiDeps) { }

    renderDashboard(
        host: HTMLElement,
        snapshot: WorkHubHomeSnapshot,
        pinnedProjects: readonly MobileProjectEntry[],
        projectCount: number,
    ): void {
        host.replaceChildren();
        const root = document.createElement('div');
        root.className = 'theia-mobile-work-hub-home';

        root.append(this.createOverviewPanel(snapshot));
        root.append(this.createShortcutsPanel());
        if (snapshot.attentionItems.length > 0) {
            root.append(this.createAttentionPanel(snapshot.attentionItems));
        }
        root.append(this.createWorkspacesPanel(pinnedProjects, projectCount));
        if (snapshot.recentItems.length > 0) {
            root.append(this.createContinuePanel(snapshot.recentItems));
        }

        host.append(root);
    }

    protected createOverviewPanel(snapshot: WorkHubHomeSnapshot): HTMLElement {
        const panel = this.createPanel('theia-mobile-work-hub-home-overview');
        const header = document.createElement('div');
        header.className = 'theia-mobile-work-hub-home-positioning';
        const label = document.createElement('span');
        label.className = 'theia-mobile-work-hub-home-positioning-label q-overline';
        label.textContent = nls.localize(
            'qaap/workHubHome/positioningLabel',
            'Mobile agent workbench',
        );
        const copy = document.createElement('p');
        copy.className = 'theia-mobile-work-hub-home-positioning-copy';
        copy.textContent = nls.localize(
            'qaap/workHubHome/positioningCopy',
            'Take tasks from capture to branch, review, and pull request without turning your phone into an IDE.',
        );
        header.append(label, copy);
        const stats = document.createElement('div');
        stats.className = 'theia-mobile-work-hub-home-metrics';
        stats.append(
            this.createMetric(snapshot.stats.runningTasks, nls.localize('qaap/workHubHome/statRunning', 'Running')),
            this.createMetric(snapshot.stats.needsYou, nls.localize('qaap/workHubHome/statPending', 'Needs you')),
            this.createMetric(snapshot.stats.openPullRequests, nls.localize('qaap/workHubHome/statPrs', 'PRs')),
        );
        panel.append(header, stats);
        return panel;
    }

    protected createMetric(value: number, label: string): HTMLElement {
        const metric = document.createElement('div');
        metric.className = 'theia-mobile-work-hub-home-metric';
        const valueEl = document.createElement('span');
        valueEl.className = 'theia-mobile-work-hub-home-metric-value';
        valueEl.textContent = String(value);
        const labelEl = document.createElement('span');
        labelEl.className = 'theia-mobile-work-hub-home-metric-label';
        labelEl.textContent = label;
        metric.append(valueEl, labelEl);
        return metric;
    }

    protected createShortcutsPanel(): HTMLElement {
        const panel = this.createPanel('theia-mobile-work-hub-home-shortcuts-panel');
        panel.append(this.createSectionHead(
            nls.localize('qaap/workHubHome/quickActions', 'Quick actions'),
        ));
        const grid = document.createElement('div');
        grid.className = 'theia-mobile-work-hub-home-shortcuts-grid';
        for (const spec of MobileProjectsHomeUi.SHORTCUTS) {
            grid.append(this.createShortcutCell(spec));
        }
        panel.append(grid);
        return panel;
    }

    protected createShortcutCell(spec: HomeShortcutSpec): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-work-hub-home-shortcut-cell';
        btn.addEventListener('click', () => this.deps.onQuickAction(spec.action));
        const icon = document.createElement('span');
        icon.className = `theia-mobile-work-hub-home-shortcut-icon codicon ${spec.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const body = document.createElement('span');
        body.className = 'theia-mobile-work-hub-home-shortcut-body';
        const title = document.createElement('span');
        title.className = 'theia-mobile-work-hub-home-shortcut-title';
        title.textContent = nls.localize(`qaap/workHubHome/shortcut/${spec.action}`, spec.label);
        const hint = document.createElement('span');
        hint.className = 'theia-mobile-work-hub-home-shortcut-hint';
        hint.textContent = nls.localize(`qaap/workHubHome/shortcutHint/${spec.action}`, spec.hint);
        body.append(title, hint);
        btn.append(icon, body);
        return btn;
    }

    protected createAttentionPanel(items: readonly WorkHubHomeAttentionItem[]): HTMLElement {
        const panel = this.createPanel('theia-mobile-work-hub-home-section-panel theia-mod-attention');
        panel.append(this.createSectionHead(
            nls.localize('qaap/workHubHome/attention', 'Needs attention'),
        ));
        const list = document.createElement('div');
        list.className = 'theia-mobile-work-hub-home-rows';
        for (const item of items.slice(0, 4)) {
            list.append(this.createAttentionRow(item));
        }
        panel.append(list);
        return panel;
    }

    protected createAttentionRow(item: WorkHubHomeAttentionItem): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-work-hub-home-row theia-mod-attention';
        btn.addEventListener('click', () => this.deps.onOpenAttention(item));
        const marker = document.createElement('span');
        marker.className = 'theia-mobile-work-hub-home-row-marker q-dot q-danger';
        marker.setAttribute('aria-hidden', 'true');
        const body = document.createElement('span');
        body.className = 'theia-mobile-work-hub-home-row-body';
        const title = document.createElement('span');
        title.className = 'theia-mobile-work-hub-home-row-title';
        title.textContent = item.title;
        const subtitle = document.createElement('span');
        subtitle.className = 'theia-mobile-work-hub-home-row-meta';
        subtitle.textContent = item.meta ? `${item.subtitle} · ${item.meta}` : item.subtitle;
        body.append(title, subtitle);
        const chevron = this.createRowChevron();
        btn.append(marker, body, chevron);
        return btn;
    }

    protected createWorkspacesPanel(
        pinnedProjects: readonly MobileProjectEntry[],
        projectCount: number,
    ): HTMLElement {
        const panel = this.createPanel('theia-mobile-work-hub-home-section-panel');
        const head = this.createSectionHead(
            nls.localize('qaap/workHubHome/workspaces', 'Workspaces'),
            projectCount > pinnedProjects.length
                ? {
                    label: nls.localize('qaap/workHubHome/allProjects', 'View all'),
                    onClick: () => this.deps.onNavigate('repos'),
                }
                : {
                    label: nls.localize('qaap/workHubHome/manageProjects', 'Manage'),
                    onClick: () => this.deps.onNavigate('repos'),
                },
        );
        panel.append(head);

        if (pinnedProjects.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-work-hub-home-empty q-fs-meta';
            empty.textContent = nls.localize(
                'qaap/workHubHome/noProjects',
                'Add a GitHub repository to delegate agent work and review the resulting PR.',
            );
            panel.append(empty);
        } else {
            const list = document.createElement('div');
            list.className = 'theia-mobile-work-hub-home-rows';
            for (const project of pinnedProjects) {
                list.append(this.createWorkspaceRow(project));
            }
            panel.append(list);
        }
        return panel;
    }

    protected createWorkspaceRow(project: MobileProjectEntry): HTMLButtonElement {
        const status = this.deps.getWorkspaceStatus(project);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-work-hub-home-row';
        if (status === 'open') {
            btn.classList.add('theia-mod-open');
        } else if (status === 'running') {
            btn.classList.add('theia-mod-running');
        }
        btn.style.setProperty('--qaap-mobile-project-accent', project.color);
        btn.addEventListener('click', () => this.deps.onOpenProject(project));
        const avatar = document.createElement('span');
        avatar.className = 'theia-mobile-work-hub-home-row-avatar';
        avatar.textContent = mobileProjectInitials(project.name);
        const body = document.createElement('span');
        body.className = 'theia-mobile-work-hub-home-row-body';
        const titleRow = document.createElement('span');
        titleRow.className = 'theia-mobile-work-hub-home-row-title-row';
        const dot = document.createElement('span');
        dot.className = `theia-mobile-work-hub-home-row-dot q-dot ${
            status === 'running' ? 'q-success' : status === 'open' ? 'q-accent' : 'q-muted'
        }`;
        dot.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'theia-mobile-work-hub-home-row-title';
        name.textContent = project.name;
        titleRow.append(dot, name);
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-work-hub-home-row-meta';
        meta.textContent = this.deps.getWorkspaceActivity(project);
        body.append(titleRow, meta);
        btn.append(avatar, body, this.createRowChevron());
        return btn;
    }

    protected createContinuePanel(items: readonly WorkHubHomeRecentItem[]): HTMLElement {
        const panel = this.createPanel('theia-mobile-work-hub-home-section-panel');
        panel.append(this.createSectionHead(
            nls.localize('qaap/workHubHome/recent', 'Continue'),
        ));
        const list = document.createElement('div');
        list.className = 'theia-mobile-work-hub-home-rows';
        for (const item of items.slice(0, 5)) {
            list.append(this.createContinueRow(item));
        }
        panel.append(list);
        return panel;
    }

    protected createContinueRow(item: WorkHubHomeRecentItem): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-work-hub-home-row';
        btn.addEventListener('click', () => this.deps.onOpenRecent(item));
        const leading = document.createElement('span');
        leading.className = `theia-mobile-work-hub-home-row-leading codicon ${
            item.surface === 'chat' ? 'codicon-comment-discussion' : 'codicon-server-process'
        }`;
        leading.setAttribute('aria-hidden', 'true');
        const body = document.createElement('span');
        body.className = 'theia-mobile-work-hub-home-row-body';
        const title = document.createElement('span');
        title.className = 'theia-mobile-work-hub-home-row-title';
        title.textContent = item.title;
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-work-hub-home-row-meta';
        meta.textContent = item.subtitle;
        const project = document.createElement('span');
        project.className = 'theia-mobile-work-hub-home-row-meta theia-mod-secondary';
        project.textContent = item.projectName;
        body.append(title, meta, project);
        btn.append(leading, body, this.createRowChevron());
        return btn;
    }

    protected createPanel(className: string): HTMLElement {
        const panel = document.createElement('section');
        panel.className = `theia-mobile-work-hub-home-panel q-card ${className}`;
        return panel;
    }

    protected createSectionHead(
        title: string,
        action?: { readonly label: string; readonly onClick: () => void },
    ): HTMLElement {
        const head = document.createElement('div');
        head.className = 'theia-mobile-work-hub-home-section-head';
        const label = document.createElement('span');
        label.className = 'theia-mobile-work-hub-home-section-title q-overline';
        label.textContent = title;
        head.append(label);
        if (action) {
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'theia-mobile-work-hub-home-section-action';
            link.textContent = action.label;
            link.addEventListener('click', action.onClick);
            head.append(link);
        }
        return head;
    }

    protected createRowChevron(): HTMLElement {
        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-work-hub-home-row-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');
        return chevron;
    }
}
