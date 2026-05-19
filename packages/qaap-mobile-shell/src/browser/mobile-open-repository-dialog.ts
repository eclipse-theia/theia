// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MobileProjectEntry } from './mobile-projects-types';
import { MobileProjectsService } from './mobile-projects-service';

export interface MobileOpenRepositoryDialogDelegate {
    /** Refresh the projects panel after a successful open / create. */
    onProjectsChanged?(nextProjects: MobileProjectEntry[]): void;
}

const GITHUB_URL_OR_SLUG = /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/.*)?$/;

/**
 * Slide-down sheet that mirrors the vscode.dev "Open repository" picker.
 * Lists the signed-in user's GitHub repositories, supports filtering by
 * name, and accepts a public `owner/repo` or github.com URL.
 */
export class MobileOpenRepositoryDialog {

    protected readonly root: HTMLElement;
    protected readonly replaceCheckbox: HTMLInputElement;
    protected readonly statusRow: HTMLElement;
    protected readonly statusIcon: HTMLElement;
    protected readonly statusText: HTMLElement;
    protected readonly filterInput: HTMLInputElement;
    protected readonly list: HTMLElement;
    protected readonly emptyState: HTMLElement;
    protected readonly footer: HTMLElement;
    protected publicInput!: HTMLInputElement;
    protected publicSubmit!: HTMLButtonElement;
    protected publicError!: HTMLElement;

    protected visible = false;
    protected loading = false;
    protected repositories: MobileProjectEntry[] = [];
    protected query = '';
    protected readonly onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape' && this.visible) {
            ev.stopPropagation();
            this.hide();
        }
    };

    constructor(
        protected readonly service: MobileProjectsService,
        protected readonly delegate: MobileOpenRepositoryDialogDelegate = {},
    ) {
        this.root = document.createElement('div');
        this.root.className = 'theia-mobile-open-repo';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-modal', 'true');
        this.root.setAttribute('aria-hidden', 'true');
        this.root.hidden = true;

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-open-repo-backdrop';
        backdrop.addEventListener('click', () => this.hide());

        const sheet = document.createElement('section');
        sheet.className = 'theia-mobile-open-repo-sheet';

        sheet.append(this.createHeader());
        sheet.append(this.createDescription());
        sheet.append(this.createPublicSection());

        const replaceWrap = document.createElement('label');
        replaceWrap.className = 'theia-mobile-open-repo-checkbox';
        this.replaceCheckbox = document.createElement('input');
        this.replaceCheckbox.type = 'checkbox';
        this.replaceCheckbox.checked = true;
        const replaceText = document.createElement('span');
        replaceText.textContent = nls.localize(
            'qaap/mobileOpenRepo/replaceWorkspace',
            'Replace workspace contents (clear current files before import)'
        );
        replaceWrap.append(this.replaceCheckbox, replaceText);
        sheet.append(replaceWrap);

        this.statusRow = document.createElement('div');
        this.statusRow.className = 'theia-mobile-open-repo-status';
        this.statusIcon = document.createElement('span');
        this.statusIcon.className = 'theia-mobile-open-repo-status-icon codicon codicon-github-inverted';
        this.statusIcon.setAttribute('aria-hidden', 'true');
        this.statusText = document.createElement('span');
        this.statusText.className = 'theia-mobile-open-repo-status-text';
        this.statusRow.append(this.statusIcon, this.statusText);
        sheet.append(this.statusRow);

        const filterWrap = document.createElement('div');
        filterWrap.className = 'theia-mobile-open-repo-filter';
        const filterIcon = document.createElement('span');
        filterIcon.className = 'codicon codicon-search';
        filterIcon.setAttribute('aria-hidden', 'true');
        this.filterInput = document.createElement('input');
        this.filterInput.type = 'search';
        this.filterInput.className = 'theia-mobile-open-repo-filter-input';
        this.filterInput.placeholder = nls.localize(
            'qaap/mobileOpenRepo/filterPlaceholder',
            'Filter repos by name...'
        );
        this.filterInput.addEventListener('input', () => {
            this.query = this.filterInput.value.trim().toLowerCase();
            this.renderList();
        });
        filterWrap.append(filterIcon, this.filterInput);
        sheet.append(filterWrap);

        this.list = document.createElement('div');
        this.list.className = 'theia-mobile-open-repo-list';
        this.list.setAttribute('role', 'listbox');
        sheet.append(this.list);

        this.emptyState = document.createElement('div');
        this.emptyState.className = 'theia-mobile-open-repo-empty';
        this.emptyState.hidden = true;
        sheet.append(this.emptyState);

        this.footer = document.createElement('div');
        this.footer.className = 'theia-mobile-open-repo-footer';
        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'theia-mobile-open-repo-create';
        createBtn.innerHTML = '<span class="codicon codicon-add" aria-hidden="true"></span> ' +
            nls.localize('qaap/mobileOpenRepo/createNew', 'Create new repository');
        createBtn.addEventListener('click', () => { void this.onCreateNew(); });
        this.footer.append(createBtn);
        sheet.append(this.footer);

        this.root.append(backdrop, sheet);
    }

    get node(): HTMLElement {
        return this.root;
    }

    isVisible(): boolean {
        return this.visible;
    }

    async show(): Promise<void> {
        if (this.visible) {
            return;
        }
        this.visible = true;
        this.root.hidden = false;
        this.root.setAttribute('aria-hidden', 'false');
        // Reflow before adding the visible class so the slide-in transition runs.
        void this.root.offsetWidth;
        this.root.classList.add('theia-mod-visible');
        document.addEventListener('keydown', this.onKeyDown, true);
        this.renderConnectedStatus();
        await this.reloadRepositories();
        window.setTimeout(() => this.publicInput.focus({ preventScroll: true }), 80);
    }

    hide(): void {
        if (!this.visible) {
            return;
        }
        this.visible = false;
        this.root.classList.remove('theia-mod-visible');
        this.root.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', this.onKeyDown, true);
        window.setTimeout(() => {
            if (!this.visible) {
                this.root.hidden = true;
            }
        }, 180);
        this.clearPublicError();
    }

    protected createHeader(): HTMLElement {
        const header = document.createElement('header');
        header.className = 'theia-mobile-open-repo-header';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'theia-mobile-open-repo-title-wrap';
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-repo';
        icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('h2');
        title.className = 'theia-mobile-open-repo-title';
        title.textContent = nls.localize('qaap/mobileOpenRepo/title', 'Open GitHub repository');
        titleWrap.append(icon, title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'theia-mobile-open-repo-close';
        closeBtn.setAttribute('aria-label', nls.localize('qaap/mobileOpenRepo/close', 'Close'));
        const closeIcon = document.createElement('span');
        closeIcon.className = 'codicon codicon-close';
        closeIcon.setAttribute('aria-hidden', 'true');
        closeBtn.append(closeIcon);
        closeBtn.addEventListener('click', () => this.hide());

        header.append(titleWrap, closeBtn);
        return header;
    }

    protected createDescription(): HTMLElement {
        const description = document.createElement('p');
        description.className = 'theia-mobile-open-repo-description';
        description.textContent = nls.localize(
            'qaap/mobileOpenRepo/description',
            'Import like vscode.dev: use a public repo URL without signing in, or pick one of your connected GitHub repositories.'
        );
        return description;
    }

    protected createPublicSection(): HTMLElement {
        const section = document.createElement('section');
        section.className = 'theia-mobile-open-repo-section';

        const label = document.createElement('div');
        label.className = 'theia-mobile-open-repo-section-label';
        label.textContent = nls.localize('qaap/mobileOpenRepo/publicLabel', 'Public repository');

        const hint = document.createElement('p');
        hint.className = 'theia-mobile-open-repo-section-hint';
        hint.textContent = nls.localize(
            'qaap/mobileOpenRepo/publicHint',
            'Paste owner/repo or a github.com link. No OAuth or service-role required.'
        );

        const inputRow = document.createElement('div');
        inputRow.className = 'theia-mobile-open-repo-public-row';
        this.publicInput = document.createElement('input');
        this.publicInput.type = 'text';
        this.publicInput.className = 'theia-mobile-open-repo-public-input';
        this.publicInput.placeholder = nls.localize(
            'qaap/mobileOpenRepo/publicPlaceholder',
            'facebook/react or https://github.com/microsoft/vscode'
        );
        this.publicInput.spellcheck = false;
        this.publicInput.autocomplete = 'off';
        this.publicInput.addEventListener('input', () => this.clearPublicError());
        this.publicInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                void this.onSubmitPublic();
            }
        });

        this.publicSubmit = document.createElement('button');
        this.publicSubmit.type = 'button';
        this.publicSubmit.className = 'theia-mobile-open-repo-public-submit';
        this.publicSubmit.textContent = nls.localize('qaap/mobileOpenRepo/open', 'Open');
        this.publicSubmit.addEventListener('click', () => { void this.onSubmitPublic(); });

        this.publicError = document.createElement('p');
        this.publicError.className = 'theia-mobile-open-repo-public-error';
        this.publicError.hidden = true;

        inputRow.append(this.publicInput, this.publicSubmit);
        section.append(label, hint, inputRow, this.publicError);
        return section;
    }

    protected renderConnectedStatus(): void {
        const user = this.service.getConnectedUser();
        this.statusRow.classList.toggle('theia-mod-signed-in', !!user);
        if (user) {
            this.statusText.textContent = nls.localize(
                'qaap/mobileOpenRepo/connectedAs',
                'Connected as {0}',
                user.login || user.name
            );
        } else {
            this.statusText.textContent = nls.localize(
                'qaap/mobileOpenRepo/notConnected',
                'Not signed in to GitHub. Public URLs still work.'
            );
        }
    }

    protected async reloadRepositories(): Promise<void> {
        this.loading = true;
        this.list.classList.add('theia-mod-loading');
        this.renderList();
        try {
            this.repositories = await this.service.listGithubRepositories();
        } catch {
            this.repositories = [];
        }
        this.loading = false;
        this.list.classList.remove('theia-mod-loading');
        this.renderList();
    }

    protected renderList(): void {
        this.list.replaceChildren();
        if (this.loading && this.repositories.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'theia-mobile-open-repo-placeholder';
            placeholder.textContent = nls.localize(
                'qaap/mobileOpenRepo/loading',
                'Loading repositories…'
            );
            this.list.append(placeholder);
            this.emptyState.hidden = true;
            return;
        }
        const filtered = this.applyFilter(this.repositories);
        if (filtered.length === 0) {
            this.emptyState.hidden = false;
            this.emptyState.textContent = this.query
                ? nls.localize('qaap/mobileOpenRepo/noFilterResults', 'No repositories match your filter.')
                : this.service.getConnectedUser()
                    ? nls.localize('qaap/mobileOpenRepo/noRepositories', 'No repositories yet — paste a public URL above to get started.')
                    : nls.localize('qaap/mobileOpenRepo/signInHint', 'Sign in with GitHub to see your repositories here.');
            return;
        }
        this.emptyState.hidden = true;
        for (const project of filtered) {
            this.list.append(this.createListItem(project));
        }
    }

    protected applyFilter(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        if (!this.query) {
            return projects;
        }
        const q = this.query;
        return projects.filter(p =>
            p.name.toLowerCase().includes(q)
            || p.github?.fullName.toLowerCase().includes(q)
            || p.branch.toLowerCase().includes(q)
        );
    }

    protected createListItem(project: MobileProjectEntry): HTMLElement {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'theia-mobile-open-repo-item';
        item.setAttribute('role', 'option');
        if (project.isCurrent) {
            item.classList.add('theia-mod-current');
        }

        const avatar = document.createElement('span');
        avatar.className = 'theia-mobile-open-repo-avatar';
        avatar.style.background = project.color;
        avatar.textContent = this.service.getInitials(project.name);

        const meta = document.createElement('span');
        meta.className = 'theia-mobile-open-repo-meta';
        const nameRow = document.createElement('span');
        nameRow.className = 'theia-mobile-open-repo-name-row';
        const name = document.createElement('span');
        name.className = 'theia-mobile-open-repo-name';
        name.textContent = project.github?.fullName ?? project.name;
        nameRow.append(name);
        if (project.github?.private) {
            const tag = document.createElement('span');
            tag.className = 'theia-mobile-open-repo-tag';
            tag.textContent = nls.localize('qaap/mobileOpenRepo/private', 'PRIVATE');
            nameRow.append(tag);
        }
        meta.append(nameRow);
        if (project.task && project.task !== '—') {
            const desc = document.createElement('span');
            desc.className = 'theia-mobile-open-repo-desc';
            desc.textContent = project.task;
            meta.append(desc);
        }

        item.append(avatar, meta);
        item.addEventListener('click', () => { void this.onSelectRepository(project); });
        return item;
    }

    protected async onSubmitPublic(): Promise<void> {
        const value = this.publicInput.value.trim();
        if (!value) {
            this.showPublicError(nls.localize(
                'qaap/mobileOpenRepo/publicRequired',
                'Paste an owner/repo or github.com URL.'
            ));
            return;
        }
        if (!GITHUB_URL_OR_SLUG.test(value)) {
            this.showPublicError(nls.localize(
                'qaap/mobileOpenRepo/publicInvalid',
                'Use the form owner/repo or a github.com URL.'
            ));
            return;
        }
        await this.runWithBusy(() => this.service.cloneGithubProjectByRepository(value));
    }

    protected async onSelectRepository(project: MobileProjectEntry): Promise<void> {
        if (!project.github) {
            return;
        }
        await this.runWithBusy(async () => {
            this.service.openInCurrentWindow(project);
            return this.service.listGithubRepositories();
        });
    }

    protected async onCreateNew(): Promise<void> {
        await this.runWithBusy(() => this.service.createGithubProject());
    }

    protected async runWithBusy(action: () => Promise<MobileProjectEntry[] | undefined>): Promise<void> {
        this.setBusy(true);
        try {
            const next = await action();
            if (next) {
                this.repositories = next;
                this.delegate.onProjectsChanged?.(next);
                this.hide();
            }
        } finally {
            this.setBusy(false);
        }
    }

    protected setBusy(busy: boolean): void {
        this.root.classList.toggle('theia-mod-busy', busy);
        this.publicSubmit.disabled = busy;
        this.publicInput.disabled = busy;
        this.filterInput.disabled = busy;
    }

    protected showPublicError(message: string): void {
        this.publicError.textContent = message;
        this.publicError.hidden = false;
    }

    protected clearPublicError(): void {
        if (!this.publicError.hidden) {
            this.publicError.hidden = true;
            this.publicError.textContent = '';
        }
    }
}
