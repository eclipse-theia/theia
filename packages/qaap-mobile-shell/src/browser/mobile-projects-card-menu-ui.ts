// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ChatService } from '@theia/ai-chat';
import { type QaapAgentConversationSummaryDTO } from '../common/qaap-agent-conversation-client';
import type { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import type { MobileProjectsConversationFlags } from './mobile-projects-conversation-flags';
import type { MobileProjectsConversations } from './mobile-projects-conversations';
import type { MobileProjectsService } from './mobile-projects-service';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileWorkHubSessionsSidebar } from './mobile-work-hub-sessions-sidebar';

export interface MobileProjectsCardMenuItemOptions {
    label: string;
    iconClass?: string;
    disabled?: boolean;
    danger?: boolean;
    title?: string;
    onSelect: () => void;
}

/** Panel surface for floating project/task card menus. */
export interface MobileProjectsCardMenuHost {
    root: HTMLElement;
    scroll: HTMLElement;
    sessionsSidebar: MobileWorkHubSessionsSidebar | undefined;
    chatService: ChatService | undefined;
    conversations: MobileProjectsConversations | undefined;
    conversationFlags: MobileProjectsConversationFlags | undefined;
    projectsService: MobileProjectsService;
    delegate: {
        onResumePreview?(project: MobileProjectEntry): void | Promise<void>;
    };

    conversationsForProject(project: MobileProjectEntry): QaapAgentConversationSummaryDTO[];
    resolveConversationFlags(summary: QaapAgentConversationSummaryDTO): { priority: boolean; paused: boolean };
    openConversationSummary(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    onRetryConversation(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    onForkConversation(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    onRenameConversation(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    onSetConversationPriority(summary: QaapAgentConversationSummaryDTO, priority: boolean): Promise<void>;
    onSetConversationPaused(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO, paused: boolean): Promise<void>;
    onCancelConversation(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): Promise<void>;
    onDeleteConversation(summary: QaapAgentConversationSummaryDTO): Promise<void>;
    openAgentComposer(project: MobileProjectEntry): Promise<void>;
    showTaskLog(project: MobileProjectEntry, taskId: string): Promise<void>;
    cancelActiveTask(taskId: string): Promise<void>;
    onTogglePin(project: MobileProjectEntry): Promise<void>;
    onRenameProject(project: MobileProjectEntry): Promise<void>;
    onDuplicateProject(project: MobileProjectEntry): Promise<void>;
    onRemoveProject(project: MobileProjectEntry): Promise<void>;
    onClearProjectChats(project: MobileProjectEntry): Promise<void>;
    closeCurrentWorkspace(): Promise<void>;
    ensureOverlayUi(): {
        parallel: {
            openParallelRunsSheet(project: MobileProjectEntry, summary: QaapAgentConversationSummaryDTO): void;
        };
    };
}

/** Floating card menus for project rows and conversation task rows. */
export class MobileProjectsCardMenuUi {

    protected openMenu: HTMLElement | undefined;
    protected openMenuAnchor: HTMLElement | undefined;
    protected openMenuCard: HTMLElement | undefined;
    protected openMenuRepositionDispose: Disposable = Disposable.NULL;

    constructor(protected readonly host: MobileProjectsCardMenuHost) { }

    handleDocumentPointerDown(ev: PointerEvent): void {
        if (!this.openMenu) {
            return;
        }
        const target = ev.target;
        if (target instanceof Node && this.openMenu.contains(target)) {
            return;
        }
        this.closeCardMenu();
    }

    handleScrollReposition(): void {
        if (this.openMenu && this.openMenuAnchor) {
            this.positionCardMenu(this.openMenu, this.openMenuAnchor);
        }
    }

    handleWindowResize(): void {
        this.handleScrollReposition();
    }

    buildProjectOptionsMenu(project: MobileProjectEntry): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: project.pinned
                ? nls.localize('qaap/mobileProjects/unpin', 'Unpin')
                : nls.localize('qaap/mobileProjects/pin', 'Pin'),
            iconClass: project.pinned ? 'codicon-pinned' : 'codicon-pin',
            onSelect: () => { void this.host.onTogglePin(project); },
        });

        if (project.isCurrent) {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/closeWorkspace', 'Close workspace'),
                iconClass: 'codicon-close',
                onSelect: () => { void this.host.closeCurrentWorkspace(); },
            });
        }

        const canRemove = this.host.projectsService.canRemove(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/remove', 'Remove'),
            iconClass: 'codicon-trash',
            danger: true,
            disabled: !canRemove,
            title: !canRemove && project.github
                ? nls.localize('qaap/mobileProjects/removeGithubDisabled', 'Remove is only for custom or recent projects')
                : !canRemove
                    ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                    : undefined,
            onSelect: () => { void this.host.onRemoveProject(project); },
        });

        const conversations = this.host.conversationsForProject(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/clearAllTasks', 'Clear all tasks'),
            iconClass: 'codicon-clear-all',
            danger: true,
            disabled: conversations.length === 0,
            title: conversations.length === 0
                ? nls.localize('qaap/mobileProjects/clearAllTasksDisabled', 'No tasks to clear')
                : undefined,
            onSelect: () => { void this.host.onClearProjectChats(project); },
        });

        return menu;
    }

    buildCardMenu(
        project: MobileProjectEntry,
        activeInfo: ReturnType<MobileProjectsActiveTasks['getForCwd']>,
    ): HTMLElement {
        const canRunTask = !!this.host.projectsService.getProjectCwd(project) || !!project.github;

        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/runTask', 'Run background task'),
            disabled: !canRunTask,
            onSelect: () => { void this.host.openAgentComposer(project); },
        });
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/viewActiveLog', 'View active log'),
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.host.showTaskLog(project, activeInfo.taskId);
                }
            },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/cancelActiveTask', 'Cancel active task'),
            danger: true,
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.host.cancelActiveTask(activeInfo.taskId);
                }
            },
        });

        if (project.previewUrl || project.isCurrent) {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/openPreview', 'Open preview'),
                disabled: !this.host.delegate.onResumePreview,
                onSelect: () => {
                    this.closeCardMenu();
                    void this.host.delegate.onResumePreview?.(project);
                },
            });
        }

        const taskSeparator = document.createElement('div');
        taskSeparator.className = 'theia-mobile-projects-card-menu-separator';
        taskSeparator.setAttribute('role', 'separator');
        menu.append(taskSeparator);

        this.appendCardMenuItem(menu, {
            label: project.pinned
                ? nls.localize('qaap/mobileProjects/unpin', 'Unpin')
                : nls.localize('qaap/mobileProjects/pin', 'Pin'),
            onSelect: () => { void this.host.onTogglePin(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/rename', 'Rename'),
            onSelect: () => { void this.host.onRenameProject(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/duplicate', 'Duplicate'),
            onSelect: () => { void this.host.onDuplicateProject(project); },
        });

        const separator = document.createElement('div');
        separator.className = 'theia-mobile-projects-card-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);

        const canRemove = this.host.projectsService.canRemove(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/remove', 'Remove'),
            danger: true,
            disabled: !canRemove,
            title: !canRemove && project.github
                ? nls.localize('qaap/mobileProjects/removeGithubDisabled', 'GitHub repositories stay visible in Projects')
                : !canRemove
                    ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                    : undefined,
            onSelect: () => { void this.host.onRemoveProject(project); },
        });

        return menu;
    }

    buildConversationMenu(
        project: MobileProjectEntry,
        summary: QaapAgentConversationSummaryDTO,
    ): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu theia-mobile-projects-conversation-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        if (summary.status === 'failed' && summary.source !== 'theia-chat') {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/retryTask', 'Retry task'),
                iconClass: 'codicon-debug-restart',
                onSelect: () => { void this.host.onRetryConversation(project, summary); },
            });
            const retrySep = document.createElement('div');
            retrySep.className = 'theia-mobile-projects-card-menu-separator';
            retrySep.setAttribute('role', 'separator');
            menu.append(retrySep);
        }

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/openChat', 'Open chat'),
            iconClass: 'codicon-comment-discussion',
            onSelect: () => {
                void this.host.openConversationSummary(project, summary);
            },
        });

        const isTheiaChat = summary.source === 'theia-chat';
        const canFork = isTheiaChat
            ? !!summary.sessionId && !!this.host.chatService && !!this.host.conversations
            : true;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/forkTask', 'Fork task'),
            iconClass: 'codicon-git-branch',
            disabled: !canFork,
            title: canFork
                ? nls.localize('qaap/mobileProjects/forkTaskTitle', 'Duplicate this task to try another strategy.')
                : nls.localize('qaap/mobileProjects/forkTaskUnavailable', 'Only saved workspace tasks can be forked here.'),
            onSelect: () => { void this.host.onForkConversation(project, summary); },
        });

        const canRunVariants = !isTheiaChat && !summary.parallelRunId;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/runVariants', 'Run variants'),
            iconClass: 'codicon-layers',
            disabled: !canRunVariants,
            title: canRunVariants
                ? nls.localize(
                    'qaap/mobileProjects/runVariantsTitle',
                    'Run the same prompt on multiple agents in parallel.',
                )
                : isTheiaChat
                    ? nls.localize(
                        'qaap/mobileProjects/runVariantsUnavailable',
                        'Parallel variants are only available for VPS agent tasks.',
                    )
                    : nls.localize(
                        'qaap/mobileProjects/runVariantsFromParentOnly',
                        'Start parallel variants from the parent task, not from a variant run.',
                    ),
            onSelect: () => {
                this.closeCardMenu();
                this.host.ensureOverlayUi().parallel.openParallelRunsSheet(project, summary);
            },
        });

        const canRename = isTheiaChat ? !!summary.sessionId && !!this.host.chatService : true;
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/renameTask', 'Rename task'),
            iconClass: 'codicon-edit',
            disabled: !canRename,
            title: canRename
                ? nls.localize('qaap/mobileProjects/renameTaskTitle', 'Change this task name.')
                : nls.localize('qaap/mobileProjects/renameTaskUnavailable', 'This task cannot be renamed.'),
            onSelect: () => { void this.host.onRenameConversation(project, summary); },
        });

        const flags = this.host.resolveConversationFlags(summary);
        const canFlag = isTheiaChat ? !!this.host.conversationFlags : true;
        this.appendCardMenuItem(menu, {
            label: flags.priority
                ? nls.localize('qaap/mobileProjects/removePriority', 'Remove high priority')
                : nls.localize('qaap/mobileProjects/markPriority', 'Mark as high priority'),
            iconClass: flags.priority ? 'codicon-star-full' : 'codicon-star-empty',
            disabled: !canFlag,
            title: flags.priority
                ? nls.localize('qaap/mobileProjects/removePriorityTitle', 'Stop pinning this task at the top.')
                : nls.localize('qaap/mobileProjects/markPriorityTitle', 'Pin this task at the top of the project list.'),
            onSelect: () => { void this.host.onSetConversationPriority(summary, !flags.priority); },
        });
        this.appendCardMenuItem(menu, {
            label: flags.paused
                ? nls.localize('qaap/mobileProjects/resumeTask', 'Resume task')
                : nls.localize('qaap/mobileProjects/pauseTask', 'Pause task'),
            iconClass: flags.paused ? 'codicon-debug-start' : 'codicon-debug-pause',
            disabled: !canFlag,
            title: flags.paused
                ? nls.localize('qaap/mobileProjects/resumeTaskTitle', 'Move this task back to the active list.')
                : nls.localize(
                    'qaap/mobileProjects/pauseTaskTitle',
                    'Stop any active turn and push this task to the bottom of the list.'
                ),
            onSelect: () => { void this.host.onSetConversationPaused(project, summary, !flags.paused); },
        });

        if (summary.status === 'streaming') {
            const separator = document.createElement('div');
            separator.className = 'theia-mobile-projects-card-menu-separator';
            separator.setAttribute('role', 'separator');
            menu.append(separator);

            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/cancelTaskRun', 'Cancel run'),
                iconClass: 'codicon-debug-stop',
                danger: true,
                onSelect: () => { void this.host.onCancelConversation(project, summary); },
            });
        }

        const separator = document.createElement('div');
        separator.className = 'theia-mobile-projects-card-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/deleteTask', 'Delete task'),
            iconClass: 'codicon-trash',
            danger: true,
            disabled: summary.source === 'theia-chat' && !summary.sessionId,
            onSelect: () => { void this.host.onDeleteConversation(summary); },
        });

        return menu;
    }

    toggleCardMenu(card: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void {
        if (this.openMenu === menu) {
            this.closeCardMenu();
            return;
        }
        this.closeCardMenu();
        this.openMenu = menu;
        this.openMenuAnchor = menuBtn;
        this.openMenuCard = card;
        menu.hidden = false;
        menu.classList.add('theia-mod-open', 'theia-mod-floating');
        this.getCardMenuPortal().appendChild(menu);
        menuBtn.setAttribute('aria-expanded', 'true');
        card.classList.add('theia-mod-menu-open');
        window.requestAnimationFrame(() => {
            if (this.openMenu === menu) {
                this.positionCardMenu(menu, menuBtn);
            }
        });
        const scrollEl = this.getCardMenuScrollElement();
        scrollEl.addEventListener('scroll', this.handleScrollReposition, { passive: true });
        window.addEventListener('resize', this.handleWindowResize);
        this.openMenuRepositionDispose.dispose();
        this.openMenuRepositionDispose = Disposable.create(() => {
            scrollEl.removeEventListener('scroll', this.handleScrollReposition);
            window.removeEventListener('resize', this.handleWindowResize);
        });
    }

    closeCardMenu(): void {
        if (!this.openMenu) {
            return;
        }
        const menu = this.openMenu;
        const card = this.openMenuCard ?? menu.closest('.theia-mobile-projects-card');
        const menuBtn = this.openMenuAnchor ?? card?.querySelector('.theia-mobile-projects-card-menu-btn');
        menu.hidden = true;
        menu.classList.remove('theia-mod-open', 'theia-mod-floating');
        this.clearCardMenuPosition(menu);
        if (card && card.contains(menu) === false) {
            card.appendChild(menu);
        }
        card?.classList.remove('theia-mod-menu-open');
        if (menuBtn instanceof HTMLButtonElement) {
            menuBtn.setAttribute('aria-expanded', 'false');
        }
        this.openMenuRepositionDispose.dispose();
        this.openMenuRepositionDispose = Disposable.NULL;
        this.openMenu = undefined;
        this.openMenuAnchor = undefined;
        this.openMenuCard = undefined;
    }

    protected getCardMenuPortal(): HTMLElement {
        return this.host.sessionsSidebar?.isVisible() ? document.body : this.host.root;
    }

    protected getCardMenuScrollElement(): HTMLElement {
        if (this.host.sessionsSidebar?.isVisible()) {
            return this.host.sessionsSidebar.getScrollElement();
        }
        return this.host.scroll;
    }

    protected positionCardMenu(menu: HTMLElement, anchor: HTMLElement): void {
        const margin = 8;
        const gap = 4;
        const anchorRect = anchor.getBoundingClientRect();
        const menuWidth = Math.max(menu.offsetWidth, 168);
        const menuHeight = menu.offsetHeight;
        let top = anchorRect.bottom + gap;
        const maxBottom = window.innerHeight - margin;
        if (top + menuHeight > maxBottom) {
            const aboveTop = anchorRect.top - gap - menuHeight;
            top = aboveTop >= margin ? aboveTop : Math.max(margin, maxBottom - menuHeight);
        }
        let left = anchorRect.right - menuWidth;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }

    protected clearCardMenuPosition(menu: HTMLElement): void {
        menu.style.top = '';
        menu.style.left = '';
        menu.style.right = '';
        menu.style.bottom = '';
        menu.style.position = '';
        menu.style.zIndex = '';
    }

    appendCardMenuItem(menu: HTMLElement, options: MobileProjectsCardMenuItemOptions): void {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-card-menu-item';
        if (options.danger) {
            item.classList.add('theia-mod-danger');
        }
        item.setAttribute('role', 'menuitem');
        if (options.iconClass) {
            const icon = document.createElement('span');
            icon.className = `codicon ${options.iconClass}`;
            icon.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = options.label;
            item.append(icon, label);
        } else {
            item.textContent = options.label;
        }
        item.disabled = !!options.disabled;
        if (options.title) {
            item.title = options.title;
        }
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!item.disabled) {
                options.onSelect();
            }
        });
        menu.append(item);
    }
}
