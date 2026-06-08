// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { conversationTurnProgressRatio } from '../common/qaap-agent-conversation-list-metrics';
import {
    isConversationAutoApproveEnabled,
    type QaapAgentConversationSummaryDTO,
} from '../common/qaap-agent-conversation-client';
import { resolveQaapAgentTaskVisualStatus } from '../common/qaap-agent-task-visual-status';
import { SHELL_AGENT_ID } from '../common/qaap-agent-task-client';
import { readStoredComposerSurface, type QaapComposerSurface } from '../common/qaap-composer-surface';
import { createAgentTaskBadge } from './qaap-agent-ui';
import type { MobileProjectsActiveTasks, MobileProjectTaskView } from './mobile-projects-active-tasks';
import type { MobileProjectsService } from './mobile-projects-service';
import { mobileProjectInitials, type MobileProjectEntry, type MobileProjectsHubView } from './mobile-projects-types';

export const MOBILE_PROJECTS_CONVERSATIONS_COLLAPSED_LIMIT = 6;

/** Panel surface for repository cards and nested task/conversation rows. */
export interface MobileProjectsProjectRowsHost {
    homeMode: boolean;
    expandedId: string | undefined;
    hubView: MobileProjectsHubView;
    expandedConversationProjectIds: Set<string>;
    transcriptOpenSummaryId: string | undefined;
    justAddedTaskId: string | undefined;
    stickyComposerSurface: QaapComposerSurface | undefined;
    preparedCwdByProjectId: Map<string, string>;
    activeTasks: MobileProjectsActiveTasks | undefined;
    projectsService: MobileProjectsService;
    delegate: { onProjectOpen(project: MobileProjectEntry): void };

    countRunningTasks(project: MobileProjectEntry): number;
    countNeedsInputTasks(project: MobileProjectEntry): number;
    countFailedTasks(project: MobileProjectEntry): number;
    countUnreadTasks(project: MobileProjectEntry): number;
    countDoneTasks(project: MobileProjectEntry): number;
    activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']>;
    buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement;
    toggleCardMenu(card: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void;
    openProjectDetail(project: MobileProjectEntry): void | Promise<void>;
    toggleRowExpanded(project: MobileProjectEntry): void | Promise<void>;
    localChatsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    vpsTasksForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    fallbackTasksFromProject(project: MobileProjectEntry): MobileProjectTaskView[];
    summaryToTaskView(conversation: QaapAgentConversationSummaryDTO): MobileProjectTaskView;
    renderList(): void;
    isConversationUnread(summary: QaapAgentConversationSummaryDTO): boolean;
    resolveConversationLineage(
        summary: QaapAgentConversationSummaryDTO,
        parentIds: ReadonlySet<string>,
    ): 'none' | 'parent' | 'child' | 'both';
    resolveConversationFlags(summary: QaapAgentConversationSummaryDTO): { priority: boolean; paused: boolean };
    buildConversationMenu(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): HTMLElement;
    onRetryConversation(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    openTaskInAgent(project: MobileProjectEntry, task?: MobileProjectTaskView): Promise<void>;
}

/** Project list cards, expanded task blocks, and conversation row rendering. */
export class MobileProjectsProjectRowsUi {

    constructor(protected readonly host: MobileProjectsProjectRowsHost) { }

    createTaskLeadingGlyph(codiconClass: string): HTMLElement {
        const glyph = document.createElement('span');
        glyph.className = `theia-mobile-projects-task-leading-glyph codicon ${codiconClass}`;
        glyph.setAttribute('aria-hidden', 'true');
        return glyph;
    }

    createRow(project: MobileProjectEntry): HTMLElement {
            const card = document.createElement('div');
            card.className = 'theia-mobile-projects-card';
            card.style.setProperty('--qaap-mobile-project-accent', project.color);
            if (project.isCurrent) {
                card.classList.add('theia-mod-current');
            }
            const isExpanded = !this.host.homeMode && this.host.expandedId === project.id;
            if (isExpanded) {
                card.classList.add('theia-mod-expanded');
            }

            const running = this.host.countRunningTasks(project) > 0;
            const needsInput = this.host.countNeedsInputTasks(project) > 0;
            const failed = this.host.countFailedTasks(project) > 0;
            const unreadCount = this.host.countUnreadTasks(project);
            const doneCount = this.host.countDoneTasks(project);
            const activeInfo = this.host.activeInfoForProject(project);

            // Collapsed header (always visible) — clicking toggles the expansion.
            const header = document.createElement('div');
            header.className = 'theia-mobile-projects-row-head';
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');

            // Status glyph follows a priority ladder so the most actionable state wins:
            //   needs-input > failed > running > unread > current workspace > done > idle
            // The colored dot + animation pair signals intent at a glance from the project list.
            const glyph = document.createElement('span');
            glyph.className = 'theia-mobile-projects-row-glyph';
            if (project.isCurrent) {
                glyph.classList.add('theia-mod-workspace');
            }
            if (needsInput) {
                glyph.classList.add('theia-mod-needs-input');
                glyph.title = nls.localize('qaap/mobileProjects/glyphNeedsInput', 'Waiting for your input');
            } else if (failed) {
                glyph.classList.add('theia-mod-failed');
                glyph.title = nls.localize('qaap/mobileProjects/glyphFailed', 'A task failed — review and retry');
            } else if (running) {
                glyph.classList.add('theia-mod-running');
                glyph.title = nls.localize('qaap/mobileProjects/glyphRunning', 'Agent is active');
            } else if (unreadCount > 0) {
                glyph.classList.add('theia-mod-unread');
                glyph.title = unreadCount === 1
                    ? nls.localize('qaap/mobileProjects/glyphUnreadOne', 'New agent reply since you last opened this project')
                    : nls.localize('qaap/mobileProjects/glyphUnreadMany', '{0} tasks with new agent replies', String(unreadCount));
            } else if (doneCount > 0) {
                glyph.classList.add('theia-mod-done');
            }

            const leading = this.host.homeMode ? this.createHomeRowAvatar(project) : glyph;
            if (this.host.homeMode) {
                for (const cls of glyph.classList) {
                    if (cls !== 'theia-mobile-projects-row-glyph') {
                        leading.classList.add(cls);
                    }
                }
                if (glyph.title) {
                    leading.title = glyph.title;
                }
            }
            header.append(leading);

            const main = document.createElement('div');
            main.className = 'theia-mobile-projects-row-main';

            const nameRow = document.createElement('div');
            nameRow.className = 'theia-mobile-projects-row-name-row';
            const chevron = document.createElement('span');
            chevron.className = 'theia-mobile-projects-row-chevron';
            chevron.textContent = '›';
            chevron.setAttribute('aria-hidden', 'true');
            nameRow.append(chevron);
            const nameGroup = document.createElement('span');
            nameGroup.className = 'theia-mobile-projects-row-name-group';
            const name = document.createElement('span');
            name.className = 'theia-mobile-projects-row-name';
            name.textContent = project.name;
            nameGroup.append(name);
            if (project.pinned) {
                const pin = document.createElement('span');
                pin.className = 'codicon codicon-pin theia-mobile-projects-row-pin';
                pin.setAttribute('aria-hidden', 'true');
                nameGroup.append(pin);
            }
            nameRow.append(nameGroup);
            if (this.host.homeMode) {
                const homeStatus = this.createHomeRowStatus(project, {
                    unreadCount,
                    running,
                    runningCount: this.host.countRunningTasks(project),
                    needsInput,
                    failed,
                    failedCount: this.host.countFailedTasks(project),
                    needsInputCount: this.host.countNeedsInputTasks(project),
                });
                if (isExpanded && homeStatus) {
                    homeStatus.classList.add('theia-mobile-projects-row-status-inline');
                    nameRow.append(homeStatus);
                }
                const open = this.createWorkspaceOpenControl(project);
                open.classList.add('theia-mobile-projects-row-name-open');
                nameRow.append(open);
                main.append(nameRow);
                if (homeStatus && !isExpanded) {
                    const subRow = document.createElement('div');
                    subRow.className = 'theia-mobile-projects-row-sub';
                    homeStatus.classList.add('theia-mobile-projects-row-status-inline');
                    subRow.append(homeStatus);
                    main.append(subRow);
                }
            } else {
                main.append(nameRow);
            }

            const metaRow = document.createElement('div');
            metaRow.className = 'theia-mobile-projects-row-meta';
            const branchSpan = document.createElement('span');
            branchSpan.textContent = project.branch;
            metaRow.append(branchSpan);
            if (project.lastActive && project.lastActive !== '—') {
                const sep = document.createElement('span');
                sep.className = 'theia-mobile-projects-row-meta-sep';
                sep.textContent = '·';
                const time = document.createElement('span');
                time.textContent = project.lastActive;
                metaRow.append(sep, time);
            }
            if (running) {
                const sep = document.createElement('span');
                sep.className = 'theia-mobile-projects-row-meta-sep';
                sep.textContent = '·';
                const run = document.createElement('span');
                run.className = 'theia-mobile-projects-row-meta-running';
                const runningCount = this.host.countRunningTasks(project);
                run.textContent = runningCount === 1
                    ? nls.localize('qaap/mobileProjects/rowRunning', '1 running')
                    : nls.localize('qaap/mobileProjects/rowRunningMany', '{0} running', String(runningCount));
                metaRow.append(sep, run);
            } else if (doneCount > 0) {
                const sep = document.createElement('span');
                sep.className = 'theia-mobile-projects-row-meta-sep';
                sep.textContent = '·';
                const cluster = document.createElement('span');
                cluster.className = 'theia-mobile-projects-row-meta-cluster';
                if (doneCount > 0) {
                    const done = document.createElement('span');
                    done.className = 'theia-mobile-projects-row-meta-done';
                    done.textContent = doneCount === 1
                        ? nls.localize('qaap/mobileProjects/rowTask', '1 task')
                        : nls.localize('qaap/mobileProjects/rowTasksMany', '{0} tasks', String(doneCount));
                    cluster.append(done);
                }
                metaRow.append(sep, cluster);
            }
            // Explicit "open in workspace" icon button on the meta row for non-home list layout.
            // Home mode always places it on the name row (collapsed and expanded).
            if (!this.host.homeMode) {
                metaRow.append(this.createWorkspaceOpenControl(project));
            }
            if (!this.host.homeMode || isExpanded) {
                main.append(metaRow);
            }
            header.append(main);

            const menu = this.host.buildProjectOptionsMenu(project);
            const menuBtn = document.createElement('button');
            menuBtn.type = 'button';
            menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-row-menu';
            menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/cardMenu', 'Project options'));
            menuBtn.setAttribute('aria-haspopup', 'menu');
            menuBtn.setAttribute('aria-expanded', 'false');
            const menuIcon = document.createElement('span');
            menuIcon.className = 'codicon codicon-kebab-vertical';
            menuIcon.setAttribute('aria-hidden', 'true');
            menuBtn.append(menuIcon);
            menuBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                this.host.toggleCardMenu(card, menu, menuBtn);
            });
            menuBtn.addEventListener('keydown', ev => ev.stopPropagation());
            header.append(menuBtn);

            const onRowActivate = (): void => {
                if (this.host.homeMode) {
                    void this.host.openProjectDetail(project);
                    return;
                }
                void this.host.toggleRowExpanded(project);
            };
            header.addEventListener('click', ev => {
                ev.stopPropagation();
                onRowActivate();
            });
            header.addEventListener('keydown', ev => {
                if (ev.key !== 'Enter' && ev.key !== ' ') {
                    return;
                }
                ev.preventDefault();
                ev.stopPropagation();
                onRowActivate();
            });
            header.addEventListener('contextmenu', ev => {
                ev.preventDefault();
                onRowActivate();
            });
            card.append(header);

            if (!isExpanded) {
                return card;
            }

            const body = document.createElement('div');
            body.className = 'theia-mobile-projects-row-body';

            const workspaceBlock = this.createWorkspaceBlock(project);
            if (workspaceBlock) {
                body.append(workspaceBlock);
            }
            body.append(this.createTaskBlock(project, activeInfo));

            card.append(body, menu);
            return card;
        }

    createHomeRowAvatar(project: MobileProjectEntry): HTMLSpanElement {
            const avatar = document.createElement('span');
            avatar.className = 'theia-mobile-projects-row-avatar';
            avatar.textContent = mobileProjectInitials(project.name);
            avatar.style.setProperty('--qaap-mobile-project-accent', project.color);
            return avatar;
        }

    createHomeRowStatus(
            project: MobileProjectEntry,
            state: {
                unreadCount: number;
                running: boolean;
                runningCount: number;
                needsInput: boolean;
                needsInputCount: number;
                failed: boolean;
                failedCount: number;
            },
        ): HTMLElement | undefined {
            const line = document.createElement('div');
            line.className = 'theia-mobile-projects-row-status';
            if (state.unreadCount > 0) {
                line.classList.add('theia-mod-new');
                line.textContent = state.unreadCount === 1
                    ? nls.localize('qaap/mobileProjects/rowNewOne', '1 new')
                    : nls.localize('qaap/mobileProjects/rowNewMany', '{0} new', String(state.unreadCount));
                return line;
            }
            if (state.needsInput) {
                line.classList.add('theia-mod-needs-input');
                line.textContent = state.needsInputCount === 1
                    ? nls.localize('qaap/mobileProjects/rowNeedsInputOne', 'Needs your input')
                    : nls.localize('qaap/mobileProjects/rowNeedsInputMany', '{0} need your input', String(state.needsInputCount));
                return line;
            }
            if (state.failed) {
                line.classList.add('theia-mod-failed');
                line.textContent = state.failedCount === 1
                    ? nls.localize('qaap/mobileProjects/rowFailedOne', '1 failed')
                    : nls.localize('qaap/mobileProjects/rowFailedMany', '{0} failed', String(state.failedCount));
                return line;
            }
            if (state.running) {
                line.classList.add('theia-mod-running');
                line.textContent = state.runningCount === 1
                    ? nls.localize('qaap/mobileProjects/rowRunning', '1 running')
                    : nls.localize('qaap/mobileProjects/rowRunningMany', '{0} running', String(state.runningCount));
                return line;
            }
            return undefined;
        }

    createWorkspaceOpenControl(project: MobileProjectEntry): HTMLButtonElement {
            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'theia-mobile-projects-row-meta-open';
            const openLabel = nls.localize('qaap/mobileProjects/workspaceOpenIn', 'Open in workspace');
            openBtn.setAttribute('aria-label', openLabel);
            openBtn.title = openLabel;
            const openIcon = document.createElement('span');
            openIcon.className = 'codicon codicon-link-external';
            openIcon.setAttribute('aria-hidden', 'true');
            openBtn.append(openIcon);
            openBtn.addEventListener('click', ev => {
                ev.stopPropagation();
                this.host.delegate.onProjectOpen(project);
            });
            openBtn.addEventListener('keydown', ev => ev.stopPropagation());
            return openBtn;
        }

    createWorkspaceBlock(project: MobileProjectEntry): HTMLElement | undefined {
            if (project.isCurrent) {
                return undefined;
            }
            // For non-current projects the "Open in workspace" affordance is rendered as a compact
            // icon button on the meta row (see createRow) so it doesn't take a full line in the body.
            return undefined;
        }

    createTaskBlock(
            project: MobileProjectEntry,
            activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
        ): HTMLElement {
            const block = document.createElement('div');
            block.className = 'theia-mobile-projects-tasks-block';
            const surface = this.detailComposerSurfaceForProject(project);
            const isChatSurface = surface === 'chat';
            const allConversations = isChatSurface
                ? this.host.localChatsForProject(project)
                : this.host.vpsTasksForProject(project);
            const head = document.createElement('div');
            head.className = 'theia-mobile-projects-tasks-head';
            const headLabel = document.createElement('span');
            headLabel.textContent = isChatSurface
                ? nls.localize('qaap/mobileProjects/chatsHeading', 'Chats')
                : nls.localize('qaap/mobileProjects/tasksHeading', 'Tasks');
            head.append(headLabel);

            if (allConversations.length > 0) {
                const count = document.createElement('span');
                count.className = 'theia-mobile-projects-tasks-count';
                count.textContent = String(allConversations.length);
                head.append(count);
            }
            block.append(head);

            if (allConversations.length === 0) {
                if (isChatSurface) {
                    const empty = document.createElement('div');
                    empty.className = 'theia-mobile-projects-tasks-empty';
                    empty.textContent = nls.localize(
                        'qaap/mobileProjects/chatsEmpty', 'No local chats yet. Start one below.'
                    );
                    block.append(empty);
                    return block;
                }
                const fallbackTasks = this.host.fallbackTasksFromProject(project);
                if (fallbackTasks.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'theia-mobile-projects-tasks-empty';
                    empty.textContent = nls.localize(
                        'qaap/mobileProjects/tasksEmpty', 'No tasks yet. Create one below.'
                    );
                    block.append(empty);
                    return block;
                }
                const list = document.createElement('div');
                list.className = 'theia-mobile-projects-tasks-list';
                for (const task of fallbackTasks) {
                    list.append(this.createTaskItem(project, task, activeInfo));
                }
                block.append(list);
                return block;
            }

            const showAll = this.host.expandedConversationProjectIds.has(project.id);
            const limit = MOBILE_PROJECTS_CONVERSATIONS_COLLAPSED_LIMIT;
            const visibleConversations = showAll
                ? allConversations
                : allConversations.slice(0, limit);
            const hiddenCount = allConversations.length - visibleConversations.length;
            const tasks = visibleConversations.map(c => this.host.summaryToTaskView(c));

            // Pre-compute the set of conversation ids that have at least one descendant fork, so each
            // row can decide which lineage glyph to render (parent / child / both / standalone).
            const parentIds = new Set<string>();
            for (const c of allConversations) {
                if (c.forkedFromId) {
                    parentIds.add(c.forkedFromId);
                }
            }

            const list = document.createElement('div');
            list.className = 'theia-mobile-projects-tasks-list';
            for (const group of this.groupConversationTasks(tasks)) {
                const section = document.createElement('section');
                section.className = `theia-mobile-projects-conversation-group theia-mod-${group.id}`;
                const groupHead = document.createElement('div');
                groupHead.className = 'theia-mobile-projects-conversation-group-head';
                const groupLabel = document.createElement('span');
                groupLabel.className = 'theia-mobile-projects-conversation-group-label';
                groupLabel.textContent = group.label;
                const groupCount = document.createElement('span');
                groupCount.className = 'theia-mobile-projects-conversation-group-count';
                groupCount.textContent = String(group.tasks.length);
                groupHead.append(groupLabel, groupCount);
                section.append(groupHead);
                for (const task of group.tasks) {
                    const summary = visibleConversations.find(c => c.id === task.id);
                    section.append(this.createTaskItem(project, task, activeInfo, summary, parentIds));
                }
                list.append(section);
            }
            block.append(list);

            if (hiddenCount > 0) {
                const moreRow = document.createElement('div');
                moreRow.className = 'theia-mobile-projects-tasks-more-row';
                const moreBtn = document.createElement('button');
                moreBtn.type = 'button';
                moreBtn.className = 'theia-mobile-projects-tasks-more-btn';
                const icon = document.createElement('span');
                icon.className = 'codicon codicon-ellipsis';
                icon.setAttribute('aria-hidden', 'true');
                moreBtn.append(
                    icon,
                    document.createTextNode(
                        isChatSurface
                            ? nls.localize('qaap/mobileProjects/chatsMore', 'More chats ({0})', String(hiddenCount))
                            : nls.localize('qaap/mobileProjects/tasksMore', 'More tasks ({0})', String(hiddenCount)),
                    ),
                );
                moreBtn.addEventListener('click', ev => {
                    ev.stopPropagation();
                    this.host.expandedConversationProjectIds.add(project.id);
                    this.host.renderList();
                });
                moreRow.append(moreBtn);
                block.append(moreRow);
            }

            return block;
        }

    detailComposerSurfaceForProject(project: MobileProjectEntry): QaapComposerSurface {
            if (!this.host.homeMode || this.host.hubView !== 'repos' || this.host.expandedId !== project.id) {
                return 'task';
            }
            const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
            return readStoredComposerSurface(cwd) ?? this.host.stickyComposerSurface ?? 'task';
        }

    groupConversationTasks(tasks: MobileProjectTaskView[]): Array<{
            id: 'working' | 'needs-you' | 'recent' | 'done';
            label: string;
            tasks: MobileProjectTaskView[];
        }> {
            type ConversationGroup = {
                id: 'working' | 'needs-you' | 'recent' | 'done';
                label: string;
                tasks: MobileProjectTaskView[];
            };
            const groups = {
                working: [] as MobileProjectTaskView[],
                needsYou: [] as MobileProjectTaskView[],
                recent: [] as MobileProjectTaskView[],
                done: [] as MobileProjectTaskView[],
            };
            const recentWindowMs = 24 * 60 * 60 * 1000;
            const now = Date.now();
            for (const task of tasks) {
                if (task.state === 'running') {
                    groups.working.push(task);
                } else if (task.state === 'needs-input' || task.state === 'failed' || task.state === 'interrupted') {
                    groups.needsYou.push(task);
                } else if (now - (task.finishedAt ?? task.createdAt) <= recentWindowMs) {
                    groups.recent.push(task);
                } else {
                    groups.done.push(task);
                }
            }
            const ordered: ConversationGroup[] = [
                {
                    id: 'working',
                    label: nls.localize('qaap/mobileProjects/taskGroupWorking', 'Working'),
                    tasks: groups.working,
                },
                {
                    id: 'needs-you',
                    label: nls.localize('qaap/mobileProjects/taskGroupNeedsYou', 'Needs you'),
                    tasks: groups.needsYou,
                },
                {
                    id: 'recent',
                    label: nls.localize('qaap/mobileProjects/taskGroupRecent', 'Recent'),
                    tasks: groups.recent,
                },
                {
                    id: 'done',
                    label: nls.localize('qaap/mobileProjects/taskGroupDone', 'Done'),
                    tasks: groups.done,
                },
            ];
            return ordered.filter(group => group.tasks.length > 0);
        }

    createTaskItem(
            project: MobileProjectEntry,
            task: MobileProjectTaskView,
            _activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
            summary?: QaapAgentConversationSummaryDTO,
            parentIds: ReadonlySet<string> = new Set<string>(),
            options?: { onActivate?: () => void; compact?: boolean },
        ): HTMLElement {
            const compact = options?.compact === true;
            const row = document.createElement('div');
            row.className = 'theia-mobile-projects-task-row';
            if (compact) {
                row.classList.add('theia-mod-sidebar-compact');
            }
            if (summary && this.host.transcriptOpenSummaryId === summary.id) {
                row.classList.add('theia-mod-current');
            }

            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'theia-mobile-projects-task-item';
            const isUnread = summary ? this.host.isConversationUnread(summary) : false;
            const visualStatus = resolveQaapAgentTaskVisualStatus(task, summary, isUnread);
            const isRunning = visualStatus.id === 'running';
            const needsInput = visualStatus.id === 'needs-you';
            const isDone = visualStatus.id === 'verified' || visualStatus.id === 'pr-ready';
            const isFailed = visualStatus.id === 'failed';
            const stateColor = visualStatus.color;
            if (this.host.justAddedTaskId === task.id) {
                item.classList.add('theia-mod-flash');
            }
            if (isDone) {
                item.classList.add('theia-mod-done');
            }
            if (needsInput) {
                item.classList.add('theia-mod-needs-input');
            }

            const lineage = summary ? this.host.resolveConversationLineage(summary, parentIds) : 'none';
            const taskDot = document.createElement('span');
            const showLineageGlyph = lineage !== 'none' && !isFailed && !isRunning && !needsInput;
            if (showLineageGlyph) {
                // Fork lineage: one glyph size for all roles; color + tooltip carry parent/child/both.
                taskDot.className = `theia-mobile-projects-task-lineage theia-mod-${lineage}`;
                taskDot.append(this.createTaskLeadingGlyph('codicon-repo-forked'));
                taskDot.setAttribute('aria-hidden', 'true');
                const lineageLabel = lineage === 'parent'
                    ? nls.localize('qaap/mobileProjects/lineageParent', 'Forked into other tasks')
                    : lineage === 'child'
                        ? nls.localize('qaap/mobileProjects/lineageChild', 'Forked from another task')
                        : nls.localize('qaap/mobileProjects/lineageBoth', 'Forked from another task and into others');
                taskDot.title = lineageLabel;
            } else if (visualStatus.id === 'verified') {
                taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
                taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
            } else if (visualStatus.id === 'pr-ready') {
                taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
                taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
            } else if (isFailed) {
                taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
                taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
            } else if (isRunning) {
                this.renderConversationTurnProgress(taskDot, summary);
            } else if (needsInput) {
                taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
                taskDot.append(this.createTaskLeadingGlyph(visualStatus.iconClass!));
            } else {
                taskDot.className = `theia-mobile-projects-task-dot ${visualStatus.className}`;
                taskDot.style.background = stateColor;
            }

            const taskBody = document.createElement('div');
            taskBody.className = 'theia-mobile-projects-task-body';

            const taskTitleRow = document.createElement('div');
            taskTitleRow.className = 'theia-mobile-projects-task-title-row';
            const taskTitle = document.createElement('span');
            taskTitle.className = 'theia-mobile-projects-task-title';
            taskTitle.textContent = task.title;
            const taskSince = document.createElement('span');
            taskSince.className = 'theia-mobile-projects-task-since';
            taskSince.textContent = this.formatTaskSince(task, summary);
            if (!compact && isRunning && summary?.turnProgressTotal && summary.turnProgressCurrent !== undefined) {
                const progressCount = document.createElement('span');
                progressCount.className = 'theia-mobile-projects-task-progress-count';
                progressCount.textContent = `${summary.turnProgressCurrent}/${summary.turnProgressTotal}`;
                const progressLabel = nls.localize(
                    'qaap/mobileProjects/taskProgressSteps',
                    '{0} of {1} steps',
                    String(summary.turnProgressCurrent),
                    String(summary.turnProgressTotal),
                );
                progressCount.setAttribute('aria-label', progressLabel);
                progressCount.title = progressLabel;
                taskTitleRow.append(taskTitle, progressCount, taskSince);
            } else {
                taskTitleRow.append(taskTitle, taskSince);
            }
            taskBody.append(taskTitleRow);

            if (!compact) {
                const footRow = document.createElement('div');
                footRow.className = 'theia-mobile-projects-task-foot';
                const agentLabel = this.resolveConversationAgentLabel(summary);
                const agentId = summary?.agentId?.trim()
                    || this.host.activeTasks?.getDefaultAgent()
                    || SHELL_AGENT_ID;
                const agentChip = createAgentTaskBadge({
                    agentId,
                    label: agentLabel,
                });
                footRow.append(agentChip);
                if (summary?.linkedPullRequest?.number) {
                    const prChip = document.createElement('span');
                    prChip.className = 'theia-mobile-projects-task-agent theia-mod-linked-pr';
                    prChip.textContent = nls.localize(
                        'qaap/mobileProjects/inboxLinkedPrShort',
                        '#{0}',
                        String(summary.linkedPullRequest.number),
                    );
                    footRow.append(prChip);
                }
                this.appendConversationFootMetrics(footRow, summary, isRunning);

                if (summary && summary.messageCount > 0 && !this.hasConversationDiffStats(summary)) {
                    this.appendTaskFootSeparator(footRow);
                    const msgCount = document.createElement('span');
                    msgCount.className = 'theia-mobile-projects-task-message-count';
                    msgCount.textContent = String(summary.messageCount);
                    const msgLabel = summary.messageCount === 1
                        ? nls.localize('qaap/mobileProjects/taskMessageOne', '1 message')
                        : nls.localize('qaap/mobileProjects/taskMessageMany', '{0} messages', String(summary.messageCount));
                    msgCount.setAttribute('aria-label', msgLabel);
                    msgCount.title = msgLabel;
                    footRow.append(msgCount);
                }
                taskBody.append(footRow);
                const activityRow = this.createConversationActivityRow(project, summary, {
                    isRunning,
                    needsInput,
                    isDone,
                });
                if (activityRow) {
                    taskBody.append(activityRow);
                }
            }

            item.append(taskDot, taskBody);
            item.addEventListener('click', ev => {
                ev.stopPropagation();
                options?.onActivate?.();
                void this.host.openTaskInAgent(project, task);
            });
            row.append(item);

            if (summary && isUnread && !needsInput) {
                const unread = document.createElement('span');
                unread.className = 'theia-mobile-projects-task-unread';
                const unreadLabel = nls.localize('qaap/mobileProjects/unreadBadge', 'New agent reply');
                unread.setAttribute('aria-label', unreadLabel);
                unread.title = unreadLabel;
                row.append(unread);
            }

            if (summary) {
                const flags = this.host.resolveConversationFlags(summary);
                if (flags.priority && !flags.paused) {
                    row.classList.add('theia-mod-priority');
                    if (!compact) {
                        const star = document.createElement('span');
                        star.className = 'codicon codicon-star-full theia-mobile-projects-conversation-priority-badge';
                        star.setAttribute('aria-label', nls.localize('qaap/mobileProjects/priorityBadge', 'High priority'));
                        star.title = star.getAttribute('aria-label')!;
                        taskTitleRow.insertBefore(star, taskTitleRow.firstChild);
                    }
                }
                if (flags.paused) {
                    row.classList.add('theia-mod-paused');
                    if (!compact) {
                        const pause = document.createElement('span');
                        pause.className = 'codicon codicon-debug-pause theia-mobile-projects-conversation-pause-badge';
                        pause.setAttribute('aria-label', nls.localize('qaap/mobileProjects/pausedBadge', 'Paused'));
                        pause.title = pause.getAttribute('aria-label')!;
                        taskTitleRow.insertBefore(pause, taskTitleRow.firstChild);
                    }
                }
                if (summary.source !== 'theia-chat' && !isConversationAutoApproveEnabled(summary)) {
                    row.classList.add('theia-mod-manual-approval');
                    if (!compact) {
                        const shield = document.createElement('span');
                        shield.className = 'codicon codicon-shield theia-mobile-projects-conversation-manual-badge';
                        const manualLabel = nls.localize('qaap/mobileProjects/manualApprovalBadge', 'Manual tool approval');
                        shield.setAttribute('aria-label', manualLabel);
                        shield.title = manualLabel;
                        taskTitleRow.insertBefore(shield, taskTitleRow.firstChild);
                    }
                }
                if (isFailed && summary.source !== 'theia-chat') {
                    const retryBtn = document.createElement('button');
                    retryBtn.type = 'button';
                    retryBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-conversation-retry-btn';
                    const retryLabel = nls.localize('qaap/mobileProjects/retryTask', 'Retry task');
                    retryBtn.setAttribute('aria-label', retryLabel);
                    retryBtn.title = retryLabel;
                    const retryIcon = document.createElement('span');
                    retryIcon.className = 'codicon codicon-debug-restart';
                    retryIcon.setAttribute('aria-hidden', 'true');
                    retryBtn.append(retryIcon);
                    retryBtn.addEventListener('click', ev => {
                        ev.stopPropagation();
                        void this.host.onRetryConversation(project, summary);
                    });
                    row.append(retryBtn);
                }

                const menuBtn = document.createElement('button');
                menuBtn.type = 'button';
                menuBtn.className = 'theia-mobile-projects-card-menu-btn theia-mobile-projects-conversation-menu-btn';
                menuBtn.setAttribute('aria-label', nls.localize('qaap/mobileProjects/taskMenu', 'Task options'));
                menuBtn.setAttribute('aria-haspopup', 'menu');
                menuBtn.setAttribute('aria-expanded', 'false');
                const icon = document.createElement('span');
                icon.className = 'codicon codicon-kebab-vertical';
                icon.setAttribute('aria-hidden', 'true');
                menuBtn.append(icon);
                const menu = this.host.buildConversationMenu(project, summary);
                menuBtn.addEventListener('click', ev => {
                    ev.stopPropagation();
                    this.host.toggleCardMenu(row, menu, menuBtn);
                });
                row.append(menuBtn, menu);
            }

            return row;
        }

    createConversationActivityRow(
            project: MobileProjectEntry,
            summary: QaapAgentConversationSummaryDTO | undefined,
            state: {
                readonly isRunning: boolean;
                readonly needsInput: boolean;
                readonly isDone: boolean;
            },
        ): HTMLElement | undefined {
            if (!summary) {
                return undefined;
            }
            const chips: HTMLElement[] = [];
            if (state.needsInput) {
                chips.push(this.createConversationActivityChip({
                    iconClass: 'codicon-comment-discussion',
                    label: nls.localize('qaap/mobileProjects/activityNeedsUser', 'Waiting for you'),
                    variant: 'needs-you',
                }));
            } else if (state.isRunning) {
                chips.push(this.createConversationActivityChip({
                    iconClass: 'codicon-sync',
                    label: summary.activityLabel?.trim()
                        || nls.localize('qaap/mobileProjects/activityAgentWorking', 'Agent working'),
                    variant: 'working',
                }));
            } else if (state.isDone || this.hasConversationDiffStats(summary)) {
                chips.push(this.createConversationActivityChip({
                    iconClass: 'codicon-check',
                    label: this.hasConversationDiffStats(summary)
                        ? nls.localize('qaap/mobileProjects/activityChangesReady', 'Changes ready')
                        : nls.localize('qaap/mobileProjects/activityDone', 'Done'),
                    variant: 'ready',
                }));
            }

            if (summary.linkedPullRequest?.number) {
                chips.push(this.createConversationActivityChip({
                    iconClass: 'codicon-git-pull-request',
                    label: nls.localize('qaap/mobileProjects/activityPullRequest', 'PR #{0}', String(summary.linkedPullRequest.number)),
                    variant: 'surface',
                }));
            }

            if (project.previewUrl) {
                chips.push(this.createConversationActivityChip({
                    iconClass: 'codicon-open-preview',
                    label: nls.localize('qaap/mobileProjects/activityPreviewReady', 'Preview ready'),
                    variant: 'surface',
                }));
            }

            if (summary.source !== 'theia-chat' || state.isRunning) {
                chips.push(this.createConversationActivityChip({
                    iconClass: 'codicon-terminal',
                    label: nls.localize('qaap/mobileProjects/activityTerminalAvailable', 'Terminal'),
                    variant: 'surface',
                }));
            }

            if (chips.length === 0) {
                return undefined;
            }
            const row = document.createElement('div');
            row.className = 'theia-mobile-projects-task-activity-row';
            row.append(...chips.slice(0, 4));
            return row;
        }

    createConversationActivityChip(options: {
            readonly iconClass: string;
            readonly label: string;
            readonly variant: 'working' | 'needs-you' | 'ready' | 'surface';
        }): HTMLElement {
            const chip = document.createElement('span');
            chip.className = `theia-mobile-projects-task-activity-chip theia-mod-${options.variant}`;
            chip.title = options.label;
            const icon = document.createElement('span');
            icon.className = `codicon ${options.iconClass}`;
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.className = 'theia-mobile-projects-task-activity-chip-label';
            label.textContent = options.label;
            chip.append(icon, label);
            return chip;
        }

    renderConversationTurnProgress(
            host: HTMLElement,
            summary?: QaapAgentConversationSummaryDTO,
        ): void {
            const hasSteps = summary?.turnProgressTotal !== undefined
                && summary.turnProgressCurrent !== undefined
                && summary.turnProgressTotal > 0;
            host.className = 'theia-mobile-projects-task-progress';
            if (!hasSteps) {
                host.classList.add('theia-mod-indeterminate');
                host.setAttribute('aria-label', nls.localize('qaap/mobileProjects/taskProgressWorking', 'Agent working'));
                return;
            }
            const current = summary!.turnProgressCurrent!;
            const total = summary!.turnProgressTotal!;
            const ratio = conversationTurnProgressRatio(current, total);
            host.style.setProperty('--theia-mobile-projects-progress', String(ratio));
            host.setAttribute('aria-label', nls.localize(
                'qaap/mobileProjects/taskProgressSteps',
                '{0} of {1} steps',
                String(current),
                String(total),
            ));
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 22 22');
            svg.setAttribute('aria-hidden', 'true');
            const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            track.setAttribute('class', 'theia-mobile-projects-task-progress-track');
            track.setAttribute('cx', '11');
            track.setAttribute('cy', '11');
            track.setAttribute('r', '9');
            const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            fill.setAttribute('class', 'theia-mobile-projects-task-progress-fill');
            fill.setAttribute('cx', '11');
            fill.setAttribute('cy', '11');
            fill.setAttribute('r', '9');
            const circumference = 2 * Math.PI * 9;
            fill.style.strokeDasharray = `${circumference}`;
            fill.style.strokeDashoffset = `${circumference * (1 - ratio)}`;
            svg.append(track, fill);
            host.append(svg);
        }

    formatTaskSince(task: MobileProjectTaskView, summary?: QaapAgentConversationSummaryDTO): string {
            const anchor = task.state === 'running'
                ? (summary?.updatedAt ?? task.createdAt)
                : (task.finishedAt ?? summary?.updatedAt ?? task.createdAt);
            if (!anchor) {
                return '';
            }
            const diff = Math.max(0, Date.now() - anchor);
            const minute = 60 * 1000;
            const hour = 60 * minute;
            const day = 24 * hour;
            if (task.state === 'running' && diff < 45 * 1000) {
                return nls.localize('qaap/mobileProjects/taskSinceNow', 'just now');
            }
            if (diff < hour) {
                return nls.localize('qaap/mobileProjects/taskSinceMinutes', '{0} min', String(Math.max(1, Math.round(diff / minute))));
            }
            if (diff < day) {
                return nls.localize('qaap/mobileProjects/taskSinceHours', '{0} h', String(Math.round(diff / hour)));
            }
            return nls.localize('qaap/mobileProjects/taskSinceDays', '{0} d', String(Math.round(diff / day)));
        }

    appendTaskFootSeparator(footRow: HTMLElement): void {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-projects-task-foot-sep';
            sep.textContent = '·';
            footRow.append(sep);
        }

    appendConversationFootMetrics(
            footRow: HTMLElement,
            summary: QaapAgentConversationSummaryDTO | undefined,
            isRunning: boolean,
        ): void {
            if (!summary) {
                return;
            }
            if (isRunning && summary.activityLabel) {
                this.appendTaskFootSeparator(footRow);
                const activity = document.createElement('span');
                activity.className = 'theia-mobile-projects-task-activity';
                activity.textContent = this.localizeActivityLabel(summary.activityLabel);
                footRow.append(activity);
            }
            if (this.hasConversationDiffStats(summary)) {
                this.appendConversationDiffFoot(footRow, summary);
            }
            const ranLabel = this.formatConversationRunDuration(summary, isRunning);
            if (ranLabel) {
                this.appendTaskFootSeparator(footRow);
                const ran = document.createElement('span');
                ran.className = 'theia-mobile-projects-task-ran';
                ran.textContent = ranLabel;
                footRow.append(ran);
            }
        }

    localizeActivityLabel(label: string): string {
            switch (label) {
                case 'Searching':
                    return nls.localize('qaap/mobileProjects/activitySearching', 'Searching');
                case 'Thinking':
                    return nls.localize('qaap/mobileProjects/activityThinking', 'Thinking');
                case 'Reading files':
                    return nls.localize('qaap/mobileProjects/activityReading', 'Reading files');
                case 'Running command':
                    return nls.localize('qaap/mobileProjects/activityRunningCommand', 'Running command');
                case 'Editing':
                    return nls.localize('qaap/mobileProjects/activityEditing', 'Editing');
                case 'Working':
                    return nls.localize('qaap/mobileProjects/taskPreviewWorking', 'Working…');
                default:
                    return label;
            }
        }

    hasConversationDiffStats(summary?: QaapAgentConversationSummaryDTO): boolean {
            if (!summary) {
                return false;
            }
            return (summary.linesAdded ?? 0) > 0 || (summary.linesRemoved ?? 0) > 0;
        }

    appendConversationDiffFoot(footRow: HTMLElement, summary: QaapAgentConversationSummaryDTO): void {
            const added = summary.linesAdded ?? 0;
            const removed = summary.linesRemoved ?? 0;
            this.appendTaskFootSeparator(footRow);
            const diff = document.createElement('span');
            diff.className = 'theia-mobile-projects-task-diff';
            const addedSpan = document.createElement('span');
            addedSpan.className = 'theia-mobile-projects-task-diff-added';
            addedSpan.textContent = `+${added}`;
            const removedSpan = document.createElement('span');
            removedSpan.className = 'theia-mobile-projects-task-diff-removed';
            removedSpan.textContent = `−${removed}`;
            diff.append(addedSpan, removedSpan);
            footRow.append(diff);
        }

    formatConversationRunDuration(
            summary: QaapAgentConversationSummaryDTO,
            isRunning: boolean,
        ): string | undefined {
            let durationMs: number | undefined;
            if (isRunning && summary.turnStartedAt) {
                durationMs = Math.max(0, Date.now() - summary.turnStartedAt);
            } else if (summary.lastTurnDurationMs) {
                durationMs = summary.lastTurnDurationMs;
            }
            if (durationMs === undefined || durationMs < 1000) {
                return undefined;
            }
            return this.formatDurationShort(durationMs);
        }

    formatDurationShort(durationMs: number): string {
            const minute = 60_000;
            const hour = 60 * minute;
            const day = 24 * hour;
            if (durationMs < minute) {
                return nls.localize(
                    'qaap/mobileProjects/durationSeconds',
                    '{0}s',
                    String(Math.max(1, Math.round(durationMs / 1000))),
                );
            }
            if (durationMs < hour) {
                return nls.localize(
                    'qaap/mobileProjects/durationMinutes',
                    '{0}m',
                    String(Math.max(1, Math.round(durationMs / minute))),
                );
            }
            if (durationMs < day) {
                return nls.localize(
                    'qaap/mobileProjects/durationHours',
                    '{0}h',
                    String(Math.round(durationMs / hour)),
                );
            }
            return nls.localize(
                'qaap/mobileProjects/durationDays',
                '{0}d',
                String(Math.round(durationMs / day)),
            );
        }

    resolveConversationAgentLabel(summary?: QaapAgentConversationSummaryDTO): string {
            const agentId = summary?.agentId?.trim()
                || this.host.activeTasks?.getDefaultAgent()
                || SHELL_AGENT_ID;
            const fromList = this.host.activeTasks?.getAgents().find(a => a.id === agentId)?.label;
            if (fromList) {
                return fromList;
            }
            if (agentId === 'chat') {
                return nls.localize('qaap/mobileProjects/agentChat', 'Chat');
            }
            return agentId.startsWith('@') ? agentId : `@${agentId}`;
        }
}
