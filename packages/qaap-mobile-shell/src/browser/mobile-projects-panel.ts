// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable } from '@theia/core/lib/common/disposable';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import {
    MOBILE_PROJECT_STATUS_COLORS,
    MobileProjectEntry,
    MobileProjectFilter,
} from './mobile-projects-types';
import { MobileAgentTaskComposer } from './mobile-agent-task-composer';
import { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import { MobileProjectsService } from './mobile-projects-service';
import { markMobileProjectReadmeForOpen } from './mobile-projects-open';
import { MobileOpenRepositoryDialog } from './mobile-open-repository-dialog';
import {
    createMobileSheetGrabber,
    installMobilePullToRefresh,
    installMobileSheetDragDismiss,
} from './mobile-sheet-gestures';
import { MobileSnackbar } from './mobile-snackbar';

export interface MobileProjectsPanelDelegate {
    onProjectOpen(project: MobileProjectEntry): void;
    onDismiss(): void;
    /** Clone/create/open from the projects UI finished and switched the IDE workspace. */
    onWorkspaceOpened?(): void;
    onProjectsChanged?(): void;
    /**
     * Invoked when the user taps the project that already matches the active workspace.
     * The shell uses it to surface the README in the editor instead of triggering a no-op reload.
     */
    onCurrentProjectActivated?(project: MobileProjectEntry): void | Promise<void>;
    onResumePreview?(project: MobileProjectEntry): void | Promise<void>;
    onOpenAgentOnTask?(project: MobileProjectEntry): void | Promise<void>;
}

export interface MobileProjectsPanelOptions {
    /**
     * Render as the workbench home view instead of a transient sheet: no drag-to-dismiss, no
     * outside-tap dismiss, no `dialog` ARIA role. The user lives here when there is no workspace
     * open, so the panel must not be dismissable.
     */
    homeMode?: boolean;
    /** Live cross-project task tracker. When provided the panel updates cards from SSE events. */
    activeTasks?: MobileProjectsActiveTasks;
}

export class MobileProjectsPanel {

    protected readonly root: HTMLElement;
    protected readonly scroll: HTMLElement;
    protected readonly subtitleEl: HTMLElement;
    protected readonly filterRow: HTMLElement;
    protected readonly searchInput: HTMLInputElement;
    protected filter: MobileProjectFilter = 'all';
    protected query = '';
    protected projects: MobileProjectEntry[] = [];
    protected visible = false;
    protected openMenu: HTMLElement | undefined;
    protected openMenuAnchor: HTMLElement | undefined;
    protected openMenuCard: HTMLElement | undefined;
    protected openMenuRepositionDispose: Disposable = Disposable.NULL;
    protected openRepoDialog: MobileOpenRepositoryDialog | undefined;
    protected agentComposer: MobileAgentTaskComposer | undefined;
    protected dragDismissDispose: Disposable = Disposable.NULL;
    protected pullToRefreshDispose: Disposable = Disposable.NULL;
    protected lastTitleTap = 0;
    protected readonly homeMode: boolean;
    protected readonly activeTasks: MobileProjectsActiveTasks | undefined;
    protected activeTasksDispose: Disposable = Disposable.NULL;
    protected readonly onDocumentPointerDown = (ev: PointerEvent): void => {
        if (!this.openMenu) {
            return;
        }
        const target = ev.target;
        if (target instanceof Node && this.openMenu.contains(target)) {
            return;
        }
        this.closeCardMenu();
    };

    protected readonly onScrollWhileMenuOpen = (): void => {
        if (this.openMenu && this.openMenuAnchor) {
            this.positionCardMenu(this.openMenu, this.openMenuAnchor);
        }
    };

    protected readonly onWindowResizeWhileMenuOpen = (): void => {
        this.onScrollWhileMenuOpen();
    };

    constructor(
        protected readonly projectsService: MobileProjectsService,
        protected readonly commands: CommandRegistry,
        protected readonly delegate: MobileProjectsPanelDelegate,
        options: MobileProjectsPanelOptions = {},
    ) {
        this.homeMode = !!options.homeMode;
        this.activeTasks = options.activeTasks;
        this.root = document.createElement('div');
        this.root.className = this.homeMode ? 'theia-mobile-projects theia-mod-home' : 'theia-mobile-projects';
        if (!this.homeMode) {
            this.root.setAttribute('role', 'dialog');
            this.root.setAttribute('aria-modal', 'true');
        }
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;

        const grabber = createMobileSheetGrabber();

        const header = document.createElement('header');
        header.className = 'theia-mobile-projects-header';

        const titleBlock = document.createElement('div');
        titleBlock.className = 'theia-mobile-projects-title-block';
        const title = document.createElement('h1');
        title.className = 'theia-mobile-projects-title';
        title.textContent = nls.localize('qaap/mobileProjects/title', 'Projects');
        this.subtitleEl = document.createElement('p');
        this.subtitleEl.className = 'theia-mobile-projects-subtitle';
        titleBlock.append(title, this.subtitleEl);

        const actions = document.createElement('div');
        actions.className = 'theia-mobile-projects-header-actions';

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'theia-mobile-projects-icon-btn codicon codicon-refresh';
        refreshBtn.title = nls.localize('qaap/mobileProjects/refresh', 'Refresh repositories');
        refreshBtn.setAttribute('aria-label', refreshBtn.title);
        refreshBtn.addEventListener('click', () => { void this.refreshProjects(); });

        const cloneBtn = document.createElement('button');
        cloneBtn.type = 'button';
        cloneBtn.className = 'theia-mobile-projects-clone-btn';
        cloneBtn.innerHTML = '<span class="codicon codicon-repo-clone" aria-hidden="true"></span> ' +
            nls.localize('qaap/mobileProjects/clone', 'Clone');
        cloneBtn.addEventListener('click', () => { void this.onCloneClick(); });

        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'theia-mobile-projects-new-btn';
        newBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span> ' +
            nls.localize('qaap/mobileProjects/new', 'New');
        newBtn.addEventListener('click', () => { void this.onNewClick(); });
        actions.append(refreshBtn, cloneBtn, newBtn);
        header.append(titleBlock, actions);

        const searchWrap = document.createElement('div');
        searchWrap.className = 'theia-mobile-projects-search';
        const searchIcon = document.createElement('span');
        searchIcon.className = 'codicon codicon-search';
        searchIcon.setAttribute('aria-hidden', 'true');
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'search';
        this.searchInput.className = 'theia-mobile-projects-search-input';
        this.searchInput.placeholder = nls.localize('qaap/mobileProjects/searchPlaceholder', 'Search repositories');
        this.searchInput.addEventListener('input', () => {
            this.query = this.searchInput.value.trim().toLowerCase();
            this.renderList();
        });
        searchWrap.append(searchIcon, this.searchInput);

        this.filterRow = document.createElement('div');
        this.filterRow.className = 'theia-mobile-projects-filters';
        this.filterRow.setAttribute('role', 'tablist');

        this.scroll = document.createElement('div');
        this.scroll.className = 'theia-mobile-projects-scroll';

        this.root.append(grabber, header, searchWrap, this.filterRow, this.scroll);

        titleBlock.addEventListener('click', () => this.onTitleTap());

        if (!this.homeMode) {
            this.dragDismissDispose = installMobileSheetDragDismiss({
                target: this.root,
                grip: grabber,
                onDismiss: () => {
                    this.hide();
                    this.delegate.onDismiss();
                },
            });
        }

        this.pullToRefreshDispose = installMobilePullToRefresh({
            scroller: this.scroll,
            host: this.root,
            onRefresh: async () => {
                await this.refreshProjects();
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/refreshed', 'Projects refreshed'),
                    { kind: 'success', duration: 1400 }
                );
            },
        });
    }

    protected onTitleTap(): void {
        const now = Date.now();
        if (now - this.lastTitleTap < 320) {
            this.scroll.scrollTo({ top: 0, behavior: 'smooth' });
            this.lastTitleTap = 0;
        } else {
            this.lastTitleTap = now;
        }
    }

    get node(): HTMLElement {
        return this.root;
    }

    isVisible(): boolean {
        return this.visible;
    }

    /** True when the panel is the workbench home (no active workspace), not a dismissable sheet. */
    isHomeMode(): boolean {
        return this.homeMode;
    }

    dispose(): void {
        this.closeCardMenu();
        this.agentComposer?.dispose();
        this.agentComposer = undefined;
        this.dragDismissDispose.dispose();
        this.dragDismissDispose = Disposable.NULL;
        this.pullToRefreshDispose.dispose();
        this.pullToRefreshDispose = Disposable.NULL;
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
    }

    async show(): Promise<void> {
        this.projects = await this.projectsService.loadProjects();
        this.filter = this.projectsService.getFilter();
        this.render();
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        this.root.classList.add('theia-mod-visible');
        document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.subscribeToActiveTasks();
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.closeCardMenu();
        this.openRepoDialog?.hide();
        this.agentComposer?.hide();
        document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = Disposable.NULL;
        this.visible = false;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.classList.remove('theia-mod-visible');
    }

    /**
     * Re-render the list when a VPS task starts or finishes in any project. We reload from the
     * service (cheap — it's an in-memory overlay) rather than mutating state in place, so
     * heuristics and SSE-derived status stay consistent through a single code path.
     */
    protected subscribeToActiveTasks(): void {
        if (!this.activeTasks) {
            return;
        }
        this.activeTasksDispose.dispose();
        this.activeTasksDispose = this.activeTasks.onDidChange(() => {
            if (!this.visible) {
                return;
            }
            void this.applyActiveTasksRefresh();
        });
    }

    protected async applyActiveTasksRefresh(): Promise<void> {
        try {
            this.projects = await this.projectsService.loadProjects();
            this.renderList();
            this.renderSubtitle();
            this.renderFilters();
        } catch {
            /* a transient load failure must not break the live view */
        }
    }

    protected renderSubtitle(): void {
        const activeCount = this.projectsService.countActive(this.projects);
        this.subtitleEl.textContent = nls.localize(
            'qaap/mobileProjects/subtitle',
            '{0} repositories · {1} active',
            String(this.projects.length),
            String(activeCount)
        );
    }

    protected async onNewClick(): Promise<void> {
        if (!this.openRepoDialog) {
            this.openRepoDialog = new MobileOpenRepositoryDialog(this.projectsService, {
                onProjectsChanged: nextProjects => {
                    this.projects = nextProjects;
                    this.render();
                    this.delegate.onProjectsChanged?.();
                },
                onWorkspaceOpened: () => this.delegate.onWorkspaceOpened?.(),
            });
            this.root.append(this.openRepoDialog.node);
        }
        await this.openRepoDialog.show();
    }

    protected async onCloneClick(): Promise<void> {
        this.root.classList.add('theia-mod-loading');
        try {
            const nextProjects = await this.projectsService.cloneGithubProject();
            if (!nextProjects) {
                return;
            }
            this.projects = nextProjects;
            this.render();
            this.delegate.onProjectsChanged?.();
            this.delegate.onWorkspaceOpened?.();
        } finally {
            this.root.classList.remove('theia-mod-loading');
        }
    }

    protected async refreshProjects(): Promise<void> {
        this.root.classList.add('theia-mod-loading');
        try {
            this.projects = await this.projectsService.loadProjects();
            this.render();
            this.delegate.onProjectsChanged?.();
        } finally {
            this.root.classList.remove('theia-mod-loading');
        }
    }

    protected render(): void {
        const activeCount = this.projectsService.countActive(this.projects);
        this.subtitleEl.textContent = nls.localize(
            'qaap/mobileProjects/subtitle',
            '{0} repositories · {1} active',
            String(this.projects.length),
            String(activeCount)
        );
        this.renderFilters();
        this.renderList();
    }

    protected renderFilters(): void {
        this.filterRow.replaceChildren();
        const active = this.projectsService.countActive(this.projects);
        const pinned = this.projects.filter(p => p.pinned).length;
        const chips: Array<{ id: MobileProjectFilter; label: string; count: number }> = [
            { id: 'all', label: nls.localize('qaap/mobileProjects/filterAll', 'All'), count: this.projects.length },
            { id: 'active', label: nls.localize('qaap/mobileProjects/filterActive', 'Active'), count: active },
            { id: 'pinned', label: nls.localize('qaap/mobileProjects/filterPinned', 'Pinned'), count: pinned },
        ];
        for (const chip of chips) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-filter-chip';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', this.filter === chip.id ? 'true' : 'false');
            if (this.filter === chip.id) {
                btn.classList.add('theia-mod-active');
            }
            btn.textContent = chip.label;
            const count = document.createElement('span');
            count.className = 'theia-mobile-projects-filter-count';
            count.textContent = String(chip.count);
            btn.append(count);
            btn.addEventListener('click', () => {
                this.filter = chip.id;
                this.projectsService.setFilter(chip.id);
                this.renderFilters();
                this.renderList();
            });
            this.filterRow.append(btn);
        }
    }

    protected renderList(): void {
        this.closeCardMenu();
        this.scroll.replaceChildren();
        const filtered = this.applySearch(this.projectsService.filterProjects(this.projects, this.filter));
        const working = filtered.filter(p => p.status === 'working');
        const others = filtered.filter(p => p.status !== 'working');

        if (filtered.length === 0) {
            this.scroll.append(this.createEmptyState());
        }

        if (this.filter === 'all' && working.length > 0) {
            this.scroll.append(this.createSectionLabel(
                nls.localize('qaap/mobileProjects/sectionWorking', 'Working now'),
                true
            ));
            const group = document.createElement('div');
            group.className = 'theia-mobile-projects-cards';
            for (const p of working) {
                group.append(this.createCard(p));
            }
            this.scroll.append(group);
        }

        if (others.length > 0) {
            if (this.filter === 'all' && working.length > 0) {
                this.scroll.append(this.createSectionLabel(
                    nls.localize('qaap/mobileProjects/sectionAll', 'All projects'),
                    false
                ));
            }
            const group = document.createElement('div');
            group.className = 'theia-mobile-projects-cards';
            for (const p of (this.filter === 'all' ? others : filtered)) {
                group.append(this.createCard(p));
            }
            this.scroll.append(group);
        }

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'theia-mobile-projects-add';
        addBtn.innerHTML = '<span class="codicon codicon-repo-clone" aria-hidden="true"></span> ' +
            nls.localize('qaap/mobileProjects/openFolder', 'Clone another GitHub repo');
        addBtn.addEventListener('click', () => { void this.onCloneClick(); });
        this.scroll.append(addBtn);
    }

    protected applySearch(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        if (!this.query) {
            return projects;
        }
        return projects.filter(project =>
            project.name.toLowerCase().includes(this.query)
            || project.branch.toLowerCase().includes(this.query)
            || project.task.toLowerCase().includes(this.query)
            || project.github?.fullName.toLowerCase().includes(this.query)
        );
    }

    protected createEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-repo';
        const title = document.createElement('strong');
        title.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noSearchResults', 'No matching repositories')
            : nls.localize('qaap/mobileProjects/noRepositories', 'No repositories yet');
        const body = document.createElement('span');
        body.textContent = this.query
            ? nls.localize('qaap/mobileProjects/noSearchResultsBody', 'Try another name, branch, or owner.')
            : nls.localize('qaap/mobileProjects/noRepositoriesBody', 'Create or clone a GitHub repository to start working.');
        empty.append(icon, title, body);
        return empty;
    }

    protected createSectionLabel(text: string, withDot: boolean): HTMLElement {
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-section';
        if (withDot) {
            const dot = document.createElement('span');
            dot.className = 'theia-mobile-projects-section-dot';
            row.append(dot);
        }
        const label = document.createElement('span');
        label.className = 'theia-mobile-projects-section-label';
        label.textContent = text;
        row.append(label);
        return row;
    }

    protected createCard(project: MobileProjectEntry): HTMLElement {
        const status = MOBILE_PROJECT_STATUS_COLORS[project.status];
        const card = document.createElement('div');
        card.className = 'theia-mobile-projects-card';
        card.style.setProperty('--qaap-mobile-project-accent', project.color);
        if (project.isCurrent) {
            card.classList.add('theia-mod-current');
        }

        const canRunTask = !!this.projectsService.getProjectCwd(project) || !!project.github;
        const canOpenNewWindow = this.projectsService.canOpenInNewWindow(project);
        const activeInfo = this.activeInfoForProject(project);

        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'theia-mobile-projects-card-menu-btn';
        menuBtn.setAttribute(
            'aria-label',
            nls.localize('qaap/mobileProjects/cardMenu', 'Project options')
        );
        menuBtn.setAttribute('aria-haspopup', 'menu');
        menuBtn.setAttribute('aria-expanded', 'false');
        const menuIcon = document.createElement('span');
        menuIcon.className = 'codicon codicon-kebab-vertical';
        menuIcon.setAttribute('aria-hidden', 'true');
        menuBtn.append(menuIcon);

        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-card-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/runTask', 'Run background task'),
            disabled: !canRunTask,
            onSelect: () => { void this.openAgentComposer(project); },
        });
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/viewActiveLog', 'View active log'),
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.showTaskLog(project, activeInfo.taskId);
                }
            },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/cancelActiveTask', 'Cancel active task'),
            danger: true,
            disabled: !activeInfo?.taskId,
            onSelect: () => {
                if (activeInfo?.taskId) {
                    void this.cancelActiveTask(activeInfo.taskId);
                }
            },
        });

        if (project.previewUrl || project.isCurrent) {
            this.appendCardMenuItem(menu, {
                label: nls.localize('qaap/mobileProjects/openPreview', 'Open preview'),
                disabled: !this.delegate.onResumePreview,
                onSelect: () => {
                    this.closeCardMenu();
                    void this.delegate.onResumePreview?.(project);
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
            onSelect: () => { void this.onTogglePin(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/rename', 'Rename'),
            onSelect: () => { void this.onRenameProject(project); },
        });

        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/duplicate', 'Duplicate'),
            onSelect: () => { void this.onDuplicateProject(project); },
        });

        const separator = document.createElement('div');
        separator.className = 'theia-mobile-projects-card-menu-separator';
        separator.setAttribute('role', 'separator');
        menu.append(separator);

        const canRemove = this.projectsService.canRemove(project);
        this.appendCardMenuItem(menu, {
            label: nls.localize('qaap/mobileProjects/remove', 'Remove'),
            danger: true,
            disabled: !canRemove,
            title: !canRemove && project.github
                ? nls.localize('qaap/mobileProjects/removeGithubDisabled', 'GitHub repositories stay visible in Projects')
                : !canRemove
                ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                : undefined,
            onSelect: () => { void this.onRemoveProject(project); },
        });

        menuBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.toggleCardMenu(card, menu, menuBtn);
        });
        card.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            this.toggleCardMenu(card, menu, menuBtn);
        });

        const main = document.createElement('div');
        main.className = 'theia-mobile-projects-card-main';

        const top = document.createElement('div');
        top.className = 'theia-mobile-projects-card-top';
        const avatar = document.createElement('span');
        avatar.className = 'theia-mobile-projects-avatar';
        avatar.textContent = this.projectsService.getInitials(project.name);

        const meta = document.createElement('div');
        meta.className = 'theia-mobile-projects-card-meta';
        const nameRow = document.createElement('div');
        nameRow.className = 'theia-mobile-projects-name-row';
        const name = document.createElement('span');
        name.className = 'theia-mobile-projects-name';
        name.textContent = project.name;
        nameRow.append(name);
        const inlineStatusDot = document.createElement('span');
        inlineStatusDot.className = 'theia-mobile-projects-name-dot';
        inlineStatusDot.style.background = status.color;
        inlineStatusDot.setAttribute('aria-hidden', 'true');
        nameRow.append(inlineStatusDot);
        if (project.pinned) {
            const pin = document.createElement('span');
            pin.className = 'codicon codicon-pin theia-mobile-projects-pin';
            pin.setAttribute('aria-hidden', 'true');
            nameRow.append(pin);
        }
        if (project.isCurrent) {
            const currentBadge = document.createElement('span');
            currentBadge.className = 'theia-mobile-projects-current-badge';
            currentBadge.textContent = nls.localize('qaap/mobileProjects/activeBadge', 'Active');
            nameRow.append(currentBadge);
        } else if (project.lastActive && project.lastActive !== '—') {
            const time = document.createElement('span');
            time.className = 'theia-mobile-projects-time';
            time.textContent = project.lastActive;
            nameRow.append(time);
        }
        const branchRow = document.createElement('div');
        branchRow.className = 'theia-mobile-projects-branch';
        branchRow.innerHTML = '<span class="codicon codicon-git-branch" aria-hidden="true"></span>';
        const branch = document.createElement('span');
        branch.textContent = project.branch;
        branchRow.append(branch);
        meta.append(nameRow, branchRow);
        top.append(avatar, meta);

        const statusRow = document.createElement('div');
        statusRow.className = 'theia-mobile-projects-status-row';
        const pill = document.createElement('span');
        pill.className = 'theia-mobile-projects-status-pill';
        pill.style.color = status.color;
        pill.style.background = status.bg;
        const dot = document.createElement('span');
        dot.className = 'theia-mobile-projects-status-dot';
        dot.style.background = status.color;
        pill.append(dot, document.createTextNode(nls.localize(status.labelKey, status.defaultLabel)));
        statusRow.append(pill);
        if (project.agents.length > 0) {
            statusRow.append(this.createAgentStack(project.agents));
        }

        main.append(top, statusRow);

        const subtitleText = activeInfo?.title
            ?? (project.task && project.task !== '—' ? project.task : undefined);
        if (subtitleText) {
            const subtitle = document.createElement('p');
            subtitle.className = 'theia-mobile-projects-card-subtitle';
            subtitle.textContent = subtitleText;
            main.append(subtitle);
        }

        if (project.progress > 0) {
            const bar = document.createElement('div');
            bar.className = 'theia-mobile-projects-progress';
            const fill = document.createElement('div');
            fill.className = 'theia-mobile-projects-progress-fill';
            fill.style.width = `${Math.round(project.progress * 100)}%`;
            bar.append(fill);
            main.append(bar);
        }

        const foot = document.createElement('div');
        foot.className = 'theia-mobile-projects-card-foot';

        const openHereLabel = project.isCurrent
            ? nls.localize('qaap/mobileProjects/focusProject', 'View project')
            : nls.localize('qaap/mobileProjects/openHere', 'Open here');
        const openHereBtn = this.createFootButton(
            openHereLabel,
            project.isCurrent ? 'codicon-eye' : 'codicon-folder-opened',
            'theia-mod-primary',
            () => { this.delegate.onProjectOpen(project); },
        );
        foot.append(openHereBtn);

        if (canOpenNewWindow) {
            foot.append(this.createFootButton(
                nls.localize('qaap/mobileProjects/openNewWindowShort', 'New window'),
                'codicon-window',
                'theia-mod-secondary',
                () => this.projectsService.openInNewWindow(project),
            ));
        }

        foot.append(this.createFootButton(
            nls.localize('qaap/mobileProjects/runTaskShort', 'Task'),
            'codicon-server-process',
            'theia-mod-accent',
            () => { void this.openAgentComposer(project); },
            !canRunTask,
        ));

        const footActions = document.createElement('div');
        footActions.className = 'theia-mobile-projects-card-foot-menu';
        footActions.append(menuBtn);
        foot.append(footActions);

        card.append(main, foot, menu);
        return card;
    }

    protected createFootButton(
        label: string,
        iconClass: string,
        modifier: 'theia-mod-primary' | 'theia-mod-secondary' | 'theia-mod-accent',
        onClick: () => void,
        disabled = false,
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `theia-mobile-projects-foot-btn ${modifier}`;
        btn.disabled = disabled;
        const icon = document.createElement('span');
        icon.className = `codicon ${iconClass}`;
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'theia-mobile-projects-foot-btn-label';
        text.textContent = label;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.append(icon, text);
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            onClick();
        });
        return btn;
    }

    protected createQuickActions(project: MobileProjectEntry): HTMLElement | undefined {
        const showPreview = !!project.previewUrl || project.isCurrent;
        const showAgent = !!project.task?.trim() && project.task !== '—';
        if (!showPreview && !showAgent) {
            return undefined;
        }
        const row = document.createElement('div');
        row.className = 'theia-mobile-projects-quick';
        row.addEventListener('click', ev => ev.stopPropagation());

        if (showPreview && this.delegate.onResumePreview) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-quick-btn';
            btn.innerHTML = '<span class="codicon codicon-preview" aria-hidden="true"></span> ' +
                nls.localize('qaap/mobileProjects/resumePreview', 'Resume preview');
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                void this.delegate.onResumePreview?.(project);
            });
            row.append(btn);
        }
        if (showAgent && this.delegate.onOpenAgentOnTask) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theia-mobile-projects-quick-btn theia-mod-secondary';
            btn.innerHTML = '<span class="codicon codicon-comment-discussion" aria-hidden="true"></span> ' +
                nls.localize('qaap/mobileProjects/openAgent', 'Open agent');
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                void this.delegate.onOpenAgentOnTask?.(project);
            });
            row.append(btn);
        }
        return row.childElementCount > 0 ? row : undefined;
    }

    protected toggleCardMenu(card: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void {
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
        this.root.appendChild(menu);
        menuBtn.setAttribute('aria-expanded', 'true');
        card.classList.add('theia-mod-menu-open');
        window.requestAnimationFrame(() => {
            if (this.openMenu === menu) {
                this.positionCardMenu(menu, menuBtn);
            }
        });
        this.scroll.addEventListener('scroll', this.onScrollWhileMenuOpen, { passive: true });
        window.addEventListener('resize', this.onWindowResizeWhileMenuOpen);
        this.openMenuRepositionDispose.dispose();
        this.openMenuRepositionDispose = Disposable.create(() => {
            this.scroll.removeEventListener('scroll', this.onScrollWhileMenuOpen);
            window.removeEventListener('resize', this.onWindowResizeWhileMenuOpen);
        });
    }

    protected closeCardMenu(): void {
        if (!this.openMenu) {
            return;
        }
        const menu = this.openMenu;
        const card = this.openMenuCard ?? menu.closest('.theia-mobile-projects-card');
        const menuBtn = card?.querySelector('.theia-mobile-projects-card-menu-btn');
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

    /** Fixed layer above the projects panel so overflow on the scroll area does not clip options. */
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

    protected appendCardMenuItem(
        menu: HTMLElement,
        options: {
            label: string;
            disabled?: boolean;
            danger?: boolean;
            title?: string;
            onSelect: () => void;
        }
    ): void {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-projects-card-menu-item';
        if (options.danger) {
            item.classList.add('theia-mod-danger');
        }
        item.setAttribute('role', 'menuitem');
        item.textContent = options.label;
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

    protected async onTogglePin(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        this.projectsService.togglePin(project);
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onRenameProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const renamed = await this.projectsService.renameProject(project);
        if (!renamed) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onDuplicateProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const duplicated = await this.projectsService.duplicateProject(project);
        if (!duplicated) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async onRemoveProject(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        const removed = await this.projectsService.removeProject(project);
        if (!removed) {
            return;
        }
        this.projects = await this.projectsService.loadProjects();
        this.render();
        this.delegate.onProjectsChanged?.();
    }

    protected async openAgentComposer(project: MobileProjectEntry): Promise<void> {
        this.closeCardMenu();
        let cwd = this.projectsService.getProjectCwd(project);
        if (!cwd && project.github) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/preparingRepo', 'Preparing {0}…', project.name),
                { kind: 'loading' }
            );
            cwd = await this.projectsService.prepareProjectCwd(project);
            MobileSnackbar.dismiss();
        }
        if (!cwd) {
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/runTaskNoCwd', 'Open or clone this project before running a background task.'),
                { duration: 2800 }
            );
            return;
        }
        if (!this.agentComposer) {
            this.agentComposer = new MobileAgentTaskComposer(this.activeTasks, {
                onSubmitted: task => {
                    this.markProjectTaskRunning(task.cwd, task.title ?? task.command);
                    this.render();
                    this.delegate.onProjectsChanged?.();
                },
            });
            this.root.append(this.agentComposer.node);
        }
        await this.agentComposer.show(project, cwd);
    }

    protected activeInfoForProject(project: MobileProjectEntry): ReturnType<MobileProjectsActiveTasks['getForCwd']> {
        const cwd = this.projectsService.getProjectCwd(project);
        return cwd && this.activeTasks ? this.activeTasks.getForCwd(cwd) : undefined;
    }

    protected markProjectTaskRunning(cwd: string, title: string | undefined): void {
        let changed = false;
        this.projects = this.projects.map(project => {
            if (this.projectsService.getProjectCwd(project) !== cwd) {
                return project;
            }
            changed = true;
            return {
                ...project,
                status: 'working',
                task: title || project.task,
                lastActive: nls.localize('qaap/mobileProjects/lastActiveNow', 'now'),
            };
        });
        if (!changed) {
            void this.applyActiveTasksRefresh();
        }
    }

    protected async cancelActiveTask(taskId: string): Promise<void> {
        this.closeCardMenu();
        try {
            const response = await fetch(`/qaap/api/agent-tasks/${encodeURIComponent(taskId)}/cancel`, {
                method: 'POST',
                credentials: 'include',
            });
            if (response.ok) {
                this.activeTasks?.recordTaskEnded(await response.json());
                MobileSnackbar.show(
                    nls.localize('qaap/mobileProjects/taskCancelled', 'Task cancelled'),
                    { duration: 1400 }
                );
            }
        } finally {
            this.projects = await this.projectsService.loadProjects();
            this.render();
            this.delegate.onProjectsChanged?.();
        }
    }

    protected async showTaskLog(project: MobileProjectEntry, taskId: string): Promise<void> {
        this.closeCardMenu();
        const root = document.createElement('div');
        root.className = 'theia-mobile-agent-log theia-mod-visible';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-agent-log-backdrop';
        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-agent-log-sheet';
        const header = document.createElement('header');
        header.className = 'theia-mobile-agent-log-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/activeLogTitle', '{0} log', project.name);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-agent-log-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileProjects/closeLog', 'Close');
        close.setAttribute('aria-label', close.title);
        const pre = document.createElement('pre');
        pre.className = 'theia-mobile-agent-log-output';
        pre.textContent = nls.localize('qaap/mobileProjects/loadingLog', 'Loading...');
        const dispose = (): void => root.remove();
        close.addEventListener('click', dispose);
        backdrop.addEventListener('click', dispose);
        header.append(title, close);
        sheet.append(header, pre);
        root.append(backdrop, sheet);
        this.root.append(root);
        try {
            const response = await fetch(`/qaap/api/agent-tasks/${encodeURIComponent(taskId)}`, { credentials: 'include' });
            if (response.ok) {
                const detail = await response.json() as { log?: string };
                pre.textContent = detail.log || nls.localize('qaap/mobileProjects/noLogOutput', '(no output yet)');
            } else {
                pre.textContent = response.statusText;
            }
        } catch (error) {
            pre.textContent = error instanceof Error ? error.message : String(error);
        }
    }

    protected createAgentStack(agents: MobileProjectEntry['agents']): HTMLElement {
        const stack = document.createElement('span');
        stack.className = 'theia-mobile-projects-agents';
        agents.forEach((agent, i) => {
            const chip = document.createElement('span');
            chip.className = 'theia-mobile-projects-agent';
            chip.style.background = agent.color;
            chip.style.marginLeft = i > 0 ? '-4px' : '0';
            chip.textContent = agent.role[0]?.toUpperCase() ?? '?';
            stack.append(chip);
        });
        return stack;
    }

    async showOpenRepositoryDialog(): Promise<void> {
        await this.onNewClick();
    }

    async openProject(project: MobileProjectEntry): Promise<void> {
        if (project.isCurrent) {
            // Active workspace: focus the editor without reloading; dismiss the sheet when not home.
            this.dismissPanelIfSheet();
            await this.delegate.onCurrentProjectActivated?.(project);
            return;
        }
        try {
            if (project.github || project.uri) {
                await this.projectsService.openInCurrentWindowAsync(project);
            } else {
                const openFolder = WorkspaceCommands.OPEN_FOLDER.id;
                if (this.commands.getCommand(openFolder)) {
                    markMobileProjectReadmeForOpen();
                    await this.commands.executeCommand(openFolder);
                }
            }
        } finally {
            // GitHub open ends in a full reload — dismissing early hid the panel before clone started.
            this.dismissPanelIfSheet();
        }
    }

    /** Sheet overlay only — home dashboard stays visible until the workspace reloads. */
    protected dismissPanelIfSheet(): void {
        if (this.homeMode) {
            return;
        }
        this.hide();
        this.delegate.onDismiss();
    }
}
