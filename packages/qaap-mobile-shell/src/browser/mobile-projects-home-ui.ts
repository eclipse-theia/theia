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
import {
    formatWorkHubUsageTokens,
    type WorkHubHomeUsageSummary,
    type WorkHubUsageMetric,
    type WorkHubUsageTab,
    type WorkHubUsageTimeRange,
} from '../common/qaap-work-hub-usage-summary';
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
        root.append(this.createUsageSummaryPanel(snapshot.usageSummary));
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

    protected createUsageSummaryPanel(usage: WorkHubHomeUsageSummary): HTMLElement {
        const panel = this.createPanel('theia-mobile-work-hub-home-usage');
        let activeTab: WorkHubUsageTab = 'summary';
        let activeRange: WorkHubUsageTimeRange = 'all';

        const toolbar = document.createElement('div');
        toolbar.className = 'theia-mobile-work-hub-home-usage-toolbar';

        const tabsHost = document.createElement('div');
        tabsHost.className = 'theia-mobile-work-hub-home-usage-tabs';
        tabsHost.setAttribute('role', 'tablist');
        const tabButtons = new Map<WorkHubUsageTab, HTMLButtonElement>();
        for (const tab of ['summary', 'models'] as const) {
            const btn = this.createUsagePill(
                tabsHost,
                nls.localize(
                    tab === 'summary'
                        ? 'qaap/workHubHome/usageTabSummary'
                        : 'qaap/workHubHome/usageTabModels',
                    tab === 'summary' ? 'Resumen' : 'Modelos',
                ),
                () => {
                    activeTab = tab;
                    syncToolbar();
                    paintBody();
                },
                () => activeTab === tab,
            );
            btn.setAttribute('role', 'tab');
            tabButtons.set(tab, btn);
        }

        const rangeHost = document.createElement('div');
        rangeHost.className = 'theia-mobile-work-hub-home-usage-range';
        rangeHost.setAttribute('role', 'group');
        const rangeButtons = new Map<WorkHubUsageTimeRange, HTMLButtonElement>();
        for (const range of ['all', '30d', '7d'] as const) {
            rangeButtons.set(range, this.createUsagePill(
                rangeHost,
                nls.localize(
                    range === 'all'
                        ? 'qaap/workHubHome/usageRangeAll'
                        : range === '30d'
                            ? 'qaap/workHubHome/usageRange30d'
                            : 'qaap/workHubHome/usageRange7d',
                    range === 'all' ? 'Todo' : range,
                ),
                () => {
                    activeRange = range;
                    syncToolbar();
                    paintBody();
                },
                () => activeRange === range,
            ));
        }

        const syncToolbar = (): void => {
            for (const [tab, btn] of tabButtons) {
                btn.classList.toggle('theia-mod-selected', activeTab === tab);
                btn.setAttribute('aria-selected', activeTab === tab ? 'true' : 'false');
            }
            for (const [range, btn] of rangeButtons) {
                btn.classList.toggle('theia-mod-selected', activeRange === range);
                btn.setAttribute('aria-pressed', activeRange === range ? 'true' : 'false');
            }
            rangeHost.hidden = activeTab !== 'summary';
        };

        toolbar.append(tabsHost, rangeHost);

        const body = document.createElement('div');
        body.className = 'theia-mobile-work-hub-home-usage-body';

        const paintBody = (): void => {
            body.replaceChildren();
            if (activeTab === 'models') {
                body.append(this.createUsageModelsView(usage));
                return;
            }
            body.append(
                this.createUsageMetricsGrid(usage.metricsByRange[activeRange]),
                this.createUsageHeatmap(usage.heatmapByRange[activeRange]),
            );
            if (usage.footnote) {
                const footnote = document.createElement('p');
                footnote.className = 'theia-mobile-work-hub-home-usage-footnote q-fs-meta';
                footnote.textContent = usage.footnote;
                body.append(footnote);
            }
        };

        syncToolbar();
        paintBody();
        panel.append(toolbar, body);
        return panel;
    }

    protected createUsagePill(
        host: HTMLElement,
        label: string,
        onClick: () => void,
        isSelected: () => boolean,
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theia-mobile-work-hub-home-usage-pill';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            if (isSelected()) {
                return;
            }
            onClick();
        });
        host.append(btn);
        return btn;
    }

    protected createUsageMetricsGrid(metrics: readonly WorkHubUsageMetric[]): HTMLElement {
        const grid = document.createElement('div');
        grid.className = 'theia-mobile-work-hub-home-usage-metrics';
        for (const metric of metrics) {
            const card = document.createElement('div');
            card.className = 'theia-mobile-work-hub-home-usage-metric';
            const label = document.createElement('span');
            label.className = 'theia-mobile-work-hub-home-usage-metric-label';
            label.textContent = this.localizeUsageMetricLabel(metric.label);
            const value = document.createElement('span');
            value.className = 'theia-mobile-work-hub-home-usage-metric-value';
            value.textContent = metric.value;
            card.append(label, value);
            grid.append(card);
        }
        return grid;
    }

    protected localizeUsageMetricLabel(key: string): string {
        switch (key) {
            case 'sessions':
                return nls.localize('qaap/workHubHome/usageMetricSessions', 'Sesiones');
            case 'messages':
                return nls.localize('qaap/workHubHome/usageMetricMessages', 'Mensajes');
            case 'tokens':
                return nls.localize('qaap/workHubHome/usageMetricTokens', 'Tokens totales');
            case 'activeDays':
                return nls.localize('qaap/workHubHome/usageMetricActiveDays', 'Días activos');
            case 'currentStreak':
                return nls.localize('qaap/workHubHome/usageMetricCurrentStreak', 'Racha actual');
            case 'longestStreak':
                return nls.localize('qaap/workHubHome/usageMetricLongestStreak', 'Racha más larga');
            case 'peakHour':
                return nls.localize('qaap/workHubHome/usageMetricPeakHour', 'Hora pico');
            case 'favoriteModel':
                return nls.localize('qaap/workHubHome/usageMetricFavoriteModel', 'Modelo favorito');
            default:
                return key;
        }
    }

    protected createUsageHeatmap(cells: readonly { readonly level: number }[]): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'theia-mobile-work-hub-home-usage-heatmap';
        wrap.setAttribute(
            'aria-label',
            nls.localize('qaap/workHubHome/usageHeatmapAria', 'Actividad reciente'),
        );
        const grid = document.createElement('div');
        grid.className = 'theia-mobile-work-hub-home-usage-heatmap-grid';
        grid.setAttribute('role', 'img');
        for (const cell of cells) {
            const box = document.createElement('span');
            box.className = `theia-mobile-work-hub-home-usage-heatmap-cell theia-mod-level-${cell.level}`;
            grid.append(box);
        }
        wrap.append(grid);
        return wrap;
    }

    protected createUsageModelsView(usage: WorkHubHomeUsageSummary): HTMLElement {
        const list = document.createElement('div');
        list.className = 'theia-mobile-work-hub-home-usage-models';
        if (usage.models.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'theia-mobile-work-hub-home-usage-models-empty q-fs-meta';
            empty.textContent = nls.localize(
                'qaap/workHubHome/usageModelsEmpty',
                'Aún no hay uso por modelo en este periodo.',
            );
            list.append(empty);
            return list;
        }
        for (const row of usage.models) {
            const item = document.createElement('div');
            item.className = 'theia-mobile-work-hub-home-usage-model-row';
            const label = document.createElement('span');
            label.className = 'theia-mobile-work-hub-home-usage-model-label';
            label.textContent = row.label;
            const value = document.createElement('span');
            value.className = 'theia-mobile-work-hub-home-usage-model-value';
            value.textContent = formatWorkHubUsageTokens(row.tokens);
            item.append(label, value);
            list.append(item);
        }
        return list;
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
