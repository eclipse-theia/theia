// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    MOBILE_PROJECT_STATUS_COLORS,
    MobileProjectEntry,
    MobileProjectFilter,
} from './mobile-projects-types';
import { MobileProjectsService } from './mobile-projects-service';

export interface MobileProjectsPanelDelegate {
    onProjectOpen(project: MobileProjectEntry): void;
    onDismiss(): void;
    onProjectsChanged?(): void;
}

export class MobileProjectsPanel {

    protected readonly root: HTMLElement;
    protected readonly scroll: HTMLElement;
    protected readonly subtitleEl: HTMLElement;
    protected readonly filterRow: HTMLElement;
    protected filter: MobileProjectFilter = 'all';
    protected projects: MobileProjectEntry[] = [];
    protected visible = false;
    protected openMenu: HTMLElement | undefined;
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

    constructor(
        protected readonly projectsService: MobileProjectsService,
        protected readonly workspaceService: WorkspaceService,
        protected readonly commands: CommandRegistry,
        protected readonly delegate: MobileProjectsPanelDelegate,
    ) {
        this.root = document.createElement('div');
        this.root.className = 'theia-mobile-projects';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;

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

        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'theia-mobile-projects-new-btn';
        newBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span> ' +
            nls.localize('qaap/mobileProjects/new', 'New');
        newBtn.addEventListener('click', () => { void this.onNewClick(); });
        header.append(titleBlock, newBtn);

        this.filterRow = document.createElement('div');
        this.filterRow.className = 'theia-mobile-projects-filters';
        this.filterRow.setAttribute('role', 'tablist');

        this.scroll = document.createElement('div');
        this.scroll.className = 'theia-mobile-projects-scroll';

        this.root.append(header, this.filterRow, this.scroll);
    }

    get node(): HTMLElement {
        return this.root;
    }

    isVisible(): boolean {
        return this.visible;
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
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.closeCardMenu();
        document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
        this.visible = false;
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
        this.root.classList.remove('theia-mod-visible');
    }

    protected async onNewClick(): Promise<void> {
        const openFolder = WorkspaceCommands.OPEN_FOLDER.id;
        if (this.commands.getCommand(openFolder) && this.commands.isEnabled(openFolder)) {
            await this.commands.executeCommand(openFolder);
        }
    }

    protected render(): void {
        const activeCount = this.projectsService.countActive(this.projects);
        this.subtitleEl.textContent = nls.localize(
            'qaap/mobileProjects/subtitle',
            '{0} · {1} active',
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
        const filtered = this.projectsService.filterProjects(this.projects, this.filter);
        const working = filtered.filter(p => p.status === 'working');
        const others = filtered.filter(p => p.status !== 'working');

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
        addBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span> ' +
            nls.localize('qaap/mobileProjects/openFolder', 'Clone repo or open a folder');
        addBtn.addEventListener('click', () => { void this.onNewClick(); });
        this.scroll.append(addBtn);
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

        const body = document.createElement('button');
        body.type = 'button';
        body.className = 'theia-mobile-projects-card-body';
        body.addEventListener('click', () => this.delegate.onProjectOpen(project));

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
            label: nls.localize('qaap/mobileProjects/openNewWindow', 'Open in new window'),
            disabled: !this.projectsService.canOpenInNewWindow(project),
            onSelect: () => {
                this.closeCardMenu();
                this.projectsService.openInNewWindow(project);
            },
        });

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
            title: !canRemove
                ? nls.localize('qaap/mobileProjects/removeCurrentDisabled', 'Cannot remove the active workspace')
                : undefined,
            onSelect: () => { void this.onRemoveProject(project); },
        });

        menuBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.toggleCardMenu(card, menu, menuBtn);
        });

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
        if (project.pinned) {
            const pin = document.createElement('span');
            pin.className = 'codicon codicon-pin theia-mobile-projects-pin';
            pin.setAttribute('aria-hidden', 'true');
            nameRow.append(pin);
        }
        if (project.lastActive && project.lastActive !== '—') {
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
        if (project.status === 'working' && project.tokens !== '—') {
            const metrics = document.createElement('span');
            metrics.className = 'theia-mobile-projects-metrics';
            metrics.textContent = `${project.tokens} · ${project.cost}`;
            statusRow.append(metrics);
        }

        const task = document.createElement('p');
        task.className = 'theia-mobile-projects-task';
        task.textContent = project.task;

        body.append(top, statusRow, task);

        if (project.progress > 0) {
            const bar = document.createElement('div');
            bar.className = 'theia-mobile-projects-progress';
            const fill = document.createElement('div');
            fill.className = 'theia-mobile-projects-progress-fill';
            fill.style.width = `${Math.round(project.progress * 100)}%`;
            bar.append(fill);
            body.append(bar);
        }

        card.append(body, menuBtn, menu);
        return card;
    }

    protected toggleCardMenu(card: HTMLElement, menu: HTMLElement, menuBtn: HTMLButtonElement): void {
        if (this.openMenu === menu) {
            this.closeCardMenu();
            return;
        }
        this.closeCardMenu();
        this.openMenu = menu;
        menu.hidden = false;
        menu.classList.add('theia-mod-open');
        menuBtn.setAttribute('aria-expanded', 'true');
        card.classList.add('theia-mod-menu-open');
    }

    protected closeCardMenu(): void {
        if (!this.openMenu) {
            return;
        }
        const card = this.openMenu.closest('.theia-mobile-projects-card');
        const menuBtn = card?.querySelector('.theia-mobile-projects-card-menu-btn');
        this.openMenu.hidden = true;
        this.openMenu.classList.remove('theia-mod-open');
        card?.classList.remove('theia-mod-menu-open');
        if (menuBtn instanceof HTMLButtonElement) {
            menuBtn.setAttribute('aria-expanded', 'false');
        }
        this.openMenu = undefined;
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

    async openProject(project: MobileProjectEntry): Promise<void> {
        if (project.uri) {
            if (project.isCurrent) {
                this.hide();
                this.delegate.onDismiss();
                return;
            }
            this.workspaceService.open(project.uri);
            return;
        }
        const openFolder = WorkspaceCommands.OPEN_FOLDER.id;
        if (this.commands.getCommand(openFolder)) {
            await this.commands.executeCommand(openFolder);
        }
    }
}
