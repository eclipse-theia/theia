// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    createTranscriptCodeView,
    resolveTranscriptCodeLanguage,
} from './qaap-transcript-code-view';
import {
    type TranscriptPreviewMonacoEditor,
    type TranscriptPreviewMonacoEditorOptions,
} from './qaap-transcript-monaco-editor';

export interface TranscriptFileTreeEntry {
    readonly name: string;
    readonly resourcePath: string;
    readonly relativePath: string;
    readonly isDirectory: boolean;
}

export interface TranscriptFilesViewServices {
    resolveRootUri(cwd: string): string | undefined;
    resolveRootLabel(cwd: string): string;
    listDirectory(resourcePath: string): Promise<readonly TranscriptFileTreeEntry[]>;
    relativePathForResource(resourcePath: string, rootUri: string): string;
    readFile(resourcePath: string): Promise<string>;
    resolveFileIcon?(resourcePath: string, isDirectory: boolean): string;
    renderMarkdownPreview?(resourcePath: string, markdown: string): HTMLElement;
    createNewFile?(parentResourcePath?: string): void | Promise<void>;
    createNewFolder?(parentResourcePath?: string): void | Promise<void>;
    openInEditor?(relativePath: string): void | Promise<void>;
    writeFile?(resourcePath: string, content: string): Promise<void>;
    createMonacoPreviewEditor?(
        host: HTMLElement,
        resourcePath: string,
        options?: TranscriptPreviewMonacoEditorOptions,
    ): Promise<TranscriptPreviewMonacoEditor | undefined>;
    watchFileTreeChanges?(onChange: () => void): Disposable;
    localize(key: string, defaultValue: string, ...args: string[]): string;
}

const FILES_TREE_MIN_PX = 120;
const FILES_TREE_MAX_RATIO = 0.78;
const TRANSCRIPT_FILES_TREE_POSITION_STORAGE_KEY = 'qaap.transcriptFiles.treePosition';
const TRANSCRIPT_FILES_TREE_VISIBLE_STORAGE_KEY = 'qaap.transcriptFiles.treeVisible';

export type TranscriptFilesTreePosition = 'side' | 'bottom';

export function defaultTranscriptFilesTreePosition(viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024): TranscriptFilesTreePosition {
    return viewportWidth <= 767 ? 'bottom' : 'side';
}

export function readStoredTranscriptFilesTreePosition(): TranscriptFilesTreePosition | undefined {
    try {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const value = window.localStorage.getItem(TRANSCRIPT_FILES_TREE_POSITION_STORAGE_KEY);
        if (value === 'side' || value === 'bottom') {
            return value;
        }
    } catch {
        /* session-only */
    }
    return undefined;
}

export function writeStoredTranscriptFilesTreePosition(position: TranscriptFilesTreePosition): void {
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(TRANSCRIPT_FILES_TREE_POSITION_STORAGE_KEY, position);
        }
    } catch {
        /* session-only */
    }
}

export function resolveTranscriptFilesTreePosition(viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024): TranscriptFilesTreePosition {
    return readStoredTranscriptFilesTreePosition() ?? defaultTranscriptFilesTreePosition(viewportWidth);
}

export function isTranscriptFilesTreeStacked(position: TranscriptFilesTreePosition): boolean {
    return position === 'bottom';
}

export function readStoredTranscriptFilesTreeVisible(): boolean | undefined {
    try {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const value = window.localStorage.getItem(TRANSCRIPT_FILES_TREE_VISIBLE_STORAGE_KEY);
        if (value === '1') {
            return true;
        }
        if (value === '0') {
            return false;
        }
    } catch {
        /* session-only */
    }
    return undefined;
}

export function writeStoredTranscriptFilesTreeVisible(visible: boolean): void {
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(TRANSCRIPT_FILES_TREE_VISIBLE_STORAGE_KEY, visible ? '1' : '0');
        }
    } catch {
        /* session-only */
    }
}

export function resolveTranscriptFilesTreeVisible(): boolean {
    return readStoredTranscriptFilesTreeVisible() ?? true;
}

export const TRANSCRIPT_FILES_SKIP_DIRS = new Set([
    '.git',
    '.hg',
    '.svn',
    'node_modules',
    '.theia',
    'dist',
    'out',
    'lib',
    '.next',
    '.turbo',
    'coverage',
]);

const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'mdx', 'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'env',
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'scss', 'less', 'html', 'svg',
    'sh', 'bash', 'zsh', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php',
]);

export function shouldSkipTranscriptFilesDirectory(name: string): boolean {
    return TRANSCRIPT_FILES_SKIP_DIRS.has(name);
}

export function filterTranscriptFileTreeEntries(
    entries: readonly TranscriptFileTreeEntry[],
    query: string,
): readonly TranscriptFileTreeEntry[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return entries;
    }
    return entries.filter(entry => entry.name.toLowerCase().includes(needle)
        || entry.relativePath.toLowerCase().includes(needle));
}

export function transcriptFileIconClass(path: string): string {
    const base = path.slice(path.lastIndexOf('/') + 1);
    const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1).toLowerCase() : '';
    if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'sh'].includes(ext)) {
        return 'codicon-file-code';
    }
    if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'env'].includes(ext)) {
        return 'codicon-settings-gear';
    }
    if (['md', 'mdx', 'txt', 'rst'].includes(ext)) {
        return 'codicon-markdown';
    }
    if (['css', 'scss', 'less', 'html', 'svg'].includes(ext)) {
        return 'codicon-symbol-color';
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext)) {
        return 'codicon-file-media';
    }
    return 'codicon-file';
}

export function isTranscriptPreviewableTextFile(path: string): boolean {
    const base = path.slice(path.lastIndexOf('/') + 1);
    if (!base.includes('.')) {
        return false;
    }
    const ext = base.slice(base.lastIndexOf('.') + 1).toLowerCase();
    return TEXT_EXTENSIONS.has(ext);
}

export const TRANSCRIPT_README_CANDIDATE_NAMES = [
    'README.md',
    'readme.md',
    'Readme.md',
    'README.MD',
    'README',
    'readme.markdown',
    'README.markdown',
] as const;

/** Picks a README from workspace-root entries (same precedence as MobileProjectsReadmeContribution). */
export function findTranscriptReadmeEntry(
    entries: readonly TranscriptFileTreeEntry[],
): TranscriptFileTreeEntry | undefined {
    for (const name of TRANSCRIPT_README_CANDIDATE_NAMES) {
        const match = entries.find(entry => !entry.isDirectory && entry.name === name);
        if (match) {
            return match;
        }
    }
    const files = entries.filter(entry => !entry.isDirectory);
    return files.find(entry => entry.name.toLowerCase() === 'readme.md')
        ?? files.find(entry => entry.name.toLowerCase().startsWith('readme'));
}

export interface TranscriptFilesMount {
    readonly root: HTMLElement;
    readonly dispose: Disposable;
}

export function mountTranscriptFilesView(
    host: HTMLElement,
    cwd: string,
    services: TranscriptFilesViewServices,
): TranscriptFilesMount {
    const disposables = new DisposableCollection();
    host.replaceChildren();

    const rootUri = services.resolveRootUri(cwd);
    const root = document.createElement('div');
    root.className = 'theia-mobile-transcript-files';
    host.append(root);
    if (!rootUri) {
        const note = document.createElement('div');
        note.className = 'theia-mobile-transcript-files-note';
        note.textContent = services.localize(
            'qaap/mobileProjects/filesUnavailable',
            'Files are unavailable for this conversation (no workspace path).',
        );
        root.append(note);
        return { root, dispose: disposables };
    }

    const rootLabel = services.resolveRootLabel(cwd);
    const state = {
        rootUri,
        rootLabel,
        expanded: new Set<string>([rootUri]),
        selected: undefined as TranscriptFileTreeEntry | undefined,
        filter: '',
        childrenByPath: new Map<string, readonly TranscriptFileTreeEntry[]>(),
        loadingPaths: new Set<string>(),
        previewRequestId: 0,
        treePosition: resolveTranscriptFilesTreePosition(),
        treeVisible: resolveTranscriptFilesTreeVisible(),
        treePaneWidthPx: undefined as number | undefined,
        treePaneHeightPx: undefined as number | undefined,
        previewEditable: false,
        previewText: undefined as string | undefined,
        previewDirty: false,
        previewSaveTimer: undefined as number | undefined,
        previewMonacoEditor: undefined as TranscriptPreviewMonacoEditor | undefined,
        previewEditorRequestId: 0,
    };

    const layout = document.createElement('div');
    layout.className = 'theia-mobile-transcript-files-layout';

    const previewPane = document.createElement('div');
    previewPane.className = 'theia-mobile-transcript-files-preview';
    const previewHeader = document.createElement('div');
    previewHeader.className = 'theia-mobile-transcript-files-preview-header';
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'theia-mobile-transcript-files-breadcrumb';
    const previewActions = document.createElement('div');
    previewActions.className = 'theia-mobile-transcript-files-preview-actions';
    const editToggleBtn = document.createElement('button');
    editToggleBtn.type = 'button';
    editToggleBtn.className = 'theia-mobile-transcript-files-action theia-mobile-transcript-files-edit-toggle codicon codicon-lock';
    editToggleBtn.title = services.localize('qaap/mobileProjects/transcriptEditFile', 'Edit file');
    editToggleBtn.setAttribute('aria-label', editToggleBtn.title);
    editToggleBtn.setAttribute('aria-pressed', 'false');
    editToggleBtn.disabled = true;
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'theia-mobile-transcript-files-action codicon codicon-ellipsis';
    moreBtn.title = services.localize('qaap/mobileProjects/transcriptFilesMore', 'More actions');
    moreBtn.setAttribute('aria-label', moreBtn.title);
    moreBtn.setAttribute('aria-haspopup', 'menu');
    moreBtn.setAttribute('aria-expanded', 'false');
    previewActions.append(editToggleBtn, moreBtn);
    previewHeader.append(breadcrumb, previewActions);
    const previewBody = document.createElement('div');
    previewBody.className = 'theia-mobile-transcript-files-preview-body';
    previewPane.append(previewHeader, previewBody);

    const treePane = document.createElement('div');
    treePane.className = 'theia-mobile-transcript-files-tree';
    const treeToolbar = document.createElement('div');
    treeToolbar.className = 'theia-mobile-transcript-files-tree-toolbar';
    const filterInput = document.createElement('input');
    filterInput.type = 'search';
    filterInput.className = 'theia-mobile-transcript-files-filter';
    filterInput.placeholder = services.localize('qaap/mobileProjects/filesFilter', 'Filter files…');
    filterInput.setAttribute('aria-label', filterInput.placeholder);
    const newFileBtn = document.createElement('button');
    newFileBtn.type = 'button';
    newFileBtn.className = 'theia-mobile-transcript-files-action codicon codicon-add';
    newFileBtn.title = services.localize('qaap/mobileProjects/transcriptNew', 'New…');
    newFileBtn.setAttribute('aria-label', newFileBtn.title);
    newFileBtn.setAttribute('aria-haspopup', 'menu');
    newFileBtn.setAttribute('aria-expanded', 'false');
    treeToolbar.append(filterInput, newFileBtn);
    const treeScroll = document.createElement('div');
    treeScroll.className = 'theia-mobile-transcript-files-tree-scroll';
    treePane.append(treeToolbar, treeScroll);

    const splitHandle = document.createElement('div');
    splitHandle.className = 'theia-mobile-transcript-files-split-handle';
    splitHandle.setAttribute('role', 'separator');
    splitHandle.setAttribute('tabindex', '0');

    layout.append(previewPane, splitHandle, treePane);
    root.append(layout);

    const moreMenu = document.createElement('div');
    moreMenu.className = 'theia-mobile-transcript-files-menu';
    moreMenu.setAttribute('role', 'menu');
    moreMenu.hidden = true;
    const editFileBtn = document.createElement('button');
    editFileBtn.type = 'button';
    editFileBtn.className = 'theia-mobile-transcript-files-menu-item';
    editFileBtn.setAttribute('role', 'menuitemcheckbox');
    editFileBtn.setAttribute('aria-checked', 'false');
    editFileBtn.disabled = true;
    editFileBtn.innerHTML = '<span class="codicon codicon-lock" aria-hidden="true"></span>'
        + `<span>${services.localize('qaap/mobileProjects/transcriptEditFile', 'Edit file')}</span>`;
    const previewActionsSep = document.createElement('div');
    previewActionsSep.className = 'theia-mobile-transcript-files-menu-separator';
    previewActionsSep.setAttribute('role', 'separator');
    const moreMenuLabel = document.createElement('div');
    moreMenuLabel.className = 'theia-mobile-transcript-files-menu-label';
    moreMenuLabel.textContent = services.localize(
        'qaap/mobileProjects/filesTreePositionLabel',
        'File tree position',
    );
    const treeSideBtn = document.createElement('button');
    treeSideBtn.type = 'button';
    treeSideBtn.className = 'theia-mobile-transcript-files-menu-item';
    treeSideBtn.setAttribute('role', 'menuitemradio');
    treeSideBtn.innerHTML = '<span class="codicon codicon-split-horizontal" aria-hidden="true"></span>'
        + `<span>${services.localize('qaap/mobileProjects/filesTreeBeside', 'Beside preview')}</span>`;
    const treeBottomBtn = document.createElement('button');
    treeBottomBtn.type = 'button';
    treeBottomBtn.className = 'theia-mobile-transcript-files-menu-item';
    treeBottomBtn.setAttribute('role', 'menuitemradio');
    treeBottomBtn.innerHTML = '<span class="codicon codicon-split-vertical" aria-hidden="true"></span>'
        + `<span>${services.localize('qaap/mobileProjects/filesTreeBelow', 'Below preview')}</span>`;
    const treeVisibilitySep = document.createElement('div');
    treeVisibilitySep.className = 'theia-mobile-transcript-files-menu-separator';
    treeVisibilitySep.setAttribute('role', 'separator');
    const treeShowBtn = document.createElement('button');
    treeShowBtn.type = 'button';
    treeShowBtn.className = 'theia-mobile-transcript-files-menu-item';
    treeShowBtn.setAttribute('role', 'menuitemcheckbox');
    treeShowBtn.innerHTML = '<span class="codicon codicon-list-tree" aria-hidden="true"></span>'
        + `<span>${services.localize('qaap/mobileProjects/filesTreeShow', 'Show file tree')}</span>`;
    moreMenu.append(editFileBtn, previewActionsSep, moreMenuLabel, treeSideBtn, treeBottomBtn, treeVisibilitySep, treeShowBtn);

    const newMenu = document.createElement('div');
    newMenu.className = 'theia-mobile-transcript-files-menu theia-mod-create';
    newMenu.setAttribute('role', 'menu');
    newMenu.hidden = true;
    const newFileItem = document.createElement('button');
    newFileItem.type = 'button';
    newFileItem.className = 'theia-mobile-transcript-files-menu-item';
    newFileItem.setAttribute('role', 'menuitem');
    newFileItem.innerHTML = '<span class="codicon codicon-new-file" aria-hidden="true"></span>'
        + `<span>${services.localize('qaap/mobileProjects/transcriptNewFile', 'New file…')}</span>`;
    const newFolderItem = document.createElement('button');
    newFolderItem.type = 'button';
    newFolderItem.className = 'theia-mobile-transcript-files-menu-item';
    newFolderItem.setAttribute('role', 'menuitem');
    newFolderItem.innerHTML = '<span class="codicon codicon-new-folder" aria-hidden="true"></span>'
        + `<span>${services.localize('qaap/mobileProjects/transcriptNewFolder', 'New folder…')}</span>`;
    newMenu.append(newFileItem, newFolderItem);

    const isTreeStacked = (): boolean => isTranscriptFilesTreeStacked(state.treePosition);

    const updateSplitHandleAria = (): void => {
        const stacked = isTreeStacked();
        splitHandle.setAttribute('aria-orientation', stacked ? 'horizontal' : 'vertical');
        splitHandle.setAttribute(
            'aria-label',
            services.localize(
                stacked
                    ? 'qaap/mobileProjects/filesResizePanelsVertical'
                    : 'qaap/mobileProjects/filesResizePanelsHorizontal',
                stacked ? 'Resize file list height' : 'Resize file list width',
            ),
        );
    };

    const applyTreePaneSize = (): void => {
        if (isTreeStacked()) {
            if (state.treePaneHeightPx !== undefined) {
                layout.style.setProperty('--qaap-files-tree-height', `${state.treePaneHeightPx}px`);
            } else {
                layout.style.removeProperty('--qaap-files-tree-height');
            }
            layout.style.removeProperty('--qaap-files-tree-width');
            return;
        }
        if (state.treePaneWidthPx !== undefined) {
            layout.style.setProperty('--qaap-files-tree-width', `${state.treePaneWidthPx}px`);
        } else {
            layout.style.removeProperty('--qaap-files-tree-width');
        }
        layout.style.removeProperty('--qaap-files-tree-height');
    };

    const syncPreviewEditUi = (): void => {
        const canEdit = Boolean(
            state.selected
            && !state.selected.isDirectory
            && isTranscriptPreviewableTextFile(state.selected.relativePath)
            && services.writeFile
            && services.createMonacoPreviewEditor,
        );
        const active = state.previewEditable;
        editFileBtn.disabled = !canEdit;
        editToggleBtn.disabled = !canEdit;
        editFileBtn.classList.toggle('theia-mod-checked', active);
        editFileBtn.setAttribute('aria-checked', String(active));
        editFileBtn.innerHTML = '<span class="codicon codicon-lock" aria-hidden="true"></span>'
            + `<span>${services.localize('qaap/mobileProjects/transcriptEditFile', 'Edit file')}</span>`;
        editToggleBtn.classList.toggle('theia-mod-active', active);
        editToggleBtn.classList.toggle('codicon-lock', !active);
        editToggleBtn.classList.toggle('codicon-unlock', active);
        editToggleBtn.setAttribute('aria-pressed', String(active));
        editToggleBtn.title = active
            ? services.localize('qaap/mobileProjects/transcriptEditingFile', 'Editing file')
            : services.localize('qaap/mobileProjects/transcriptEditFile', 'Edit file');
        editToggleBtn.setAttribute('aria-label', editToggleBtn.title);
    };

    const syncTreeLayout = (): void => {
        layout.classList.toggle('theia-mod-tree-side', state.treePosition === 'side');
        layout.classList.toggle('theia-mod-tree-bottom', state.treePosition === 'bottom');
        layout.classList.toggle('theia-mod-tree-hidden', !state.treeVisible);
        treeSideBtn.classList.toggle('theia-mod-checked', state.treePosition === 'side');
        treeBottomBtn.classList.toggle('theia-mod-checked', state.treePosition === 'bottom');
        treeSideBtn.setAttribute('aria-checked', String(state.treePosition === 'side'));
        treeBottomBtn.setAttribute('aria-checked', String(state.treePosition === 'bottom'));
        treeShowBtn.classList.toggle('theia-mod-checked', state.treeVisible);
        treeShowBtn.setAttribute('aria-checked', String(state.treeVisible));
        splitHandle.hidden = !state.treeVisible;
        syncPreviewEditUi();
        updateSplitHandleAria();
        applyTreePaneSize();
    };

    const setTreePosition = (position: TranscriptFilesTreePosition): void => {
        if (state.treePosition === position) {
            return;
        }
        state.treePosition = position;
        writeStoredTranscriptFilesTreePosition(position);
        syncTreeLayout();
    };

    const setTreeVisible = (visible: boolean): void => {
        if (state.treeVisible === visible) {
            return;
        }
        state.treeVisible = visible;
        writeStoredTranscriptFilesTreeVisible(visible);
        syncTreeLayout();
    };

    syncTreeLayout();

    let moreMenuOpen = false;
    let newMenuOpen = false;
    let moreMenuOutsideListener: ((event: Event) => void) | undefined;
    let moreMenuKeyListener: ((event: KeyboardEvent) => void) | undefined;
    let newMenuOutsideListener: ((event: Event) => void) | undefined;
    let newMenuKeyListener: ((event: KeyboardEvent) => void) | undefined;

    // Portal from `root` (live DOM under the transcript sheet), not `host`: cached mounts
    // are created on a detached stash, so `host.closest(...)` would miss the transcript root.
    const resolveMenuPortal = (): HTMLElement =>
        root.closest('.theia-mobile-agent-transcript-root') as HTMLElement ?? document.body;

    const positionAnchorMenu = (anchor: HTMLElement, menu: HTMLElement, minWidth = 220): void => {
        const margin = 8;
        const anchorRect = anchor.getBoundingClientRect();
        const menuWidth = Math.max(menu.offsetWidth, minWidth);
        let top = anchorRect.bottom + 4;
        let left = anchorRect.right - menuWidth;
        left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
        const maxTop = window.innerHeight - menu.offsetHeight - margin;
        if (top > maxTop) {
            top = Math.max(margin, anchorRect.top - menu.offsetHeight - 4);
        }
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    };

    const detachMoreMenuListeners = (): void => {
        if (moreMenuOutsideListener) {
            document.removeEventListener('pointerdown', moreMenuOutsideListener, true);
            moreMenuOutsideListener = undefined;
        }
        if (moreMenuKeyListener) {
            document.removeEventListener('keydown', moreMenuKeyListener);
            moreMenuKeyListener = undefined;
        }
    };

    const closeMoreMenu = (): void => {
        if (!moreMenuOpen) {
            return;
        }
        moreMenuOpen = false;
        moreMenu.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
        moreMenu.remove();
        detachMoreMenuListeners();
    };

    const detachNewMenuListeners = (): void => {
        if (newMenuOutsideListener) {
            document.removeEventListener('pointerdown', newMenuOutsideListener, true);
            newMenuOutsideListener = undefined;
        }
        if (newMenuKeyListener) {
            document.removeEventListener('keydown', newMenuKeyListener);
            newMenuKeyListener = undefined;
        }
    };

    const closeNewMenu = (): void => {
        if (!newMenuOpen) {
            return;
        }
        newMenuOpen = false;
        newMenu.hidden = true;
        newFileBtn.setAttribute('aria-expanded', 'false');
        newMenu.remove();
        detachNewMenuListeners();
    };

    const closeAllMenus = (): void => {
        closeMoreMenu();
        closeNewMenu();
    };

    const onMoreMenuOutside = (event: Event): void => {
        if (!moreMenuOpen) {
            return;
        }
        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }
        if (moreBtn.contains(target) || moreMenu.contains(target)) {
            return;
        }
        closeMoreMenu();
    };

    const onMoreMenuKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            closeMoreMenu();
        }
    };

    const openMoreMenu = (): void => {
        if (moreMenuOpen) {
            closeMoreMenu();
            return;
        }
        closeNewMenu();
        moreMenuOpen = true;
        syncTreeLayout();
        resolveMenuPortal().appendChild(moreMenu);
        moreMenu.hidden = false;
        moreBtn.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(() => positionAnchorMenu(moreBtn, moreMenu));
        moreMenuOutsideListener = onMoreMenuOutside;
        moreMenuKeyListener = onMoreMenuKeyDown;
        document.addEventListener('pointerdown', moreMenuOutsideListener, true);
        document.addEventListener('keydown', moreMenuKeyListener);
    };

    const onNewMenuOutside = (event: Event): void => {
        if (!newMenuOpen) {
            return;
        }
        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }
        if (newFileBtn.contains(target) || newMenu.contains(target)) {
            return;
        }
        closeNewMenu();
    };

    const onNewMenuKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            closeNewMenu();
        }
    };

    const openNewMenu = (): void => {
        if (newMenuOpen) {
            closeNewMenu();
            return;
        }
        closeMoreMenu();
        newMenuOpen = true;
        resolveMenuPortal().appendChild(newMenu);
        newMenu.hidden = false;
        newFileBtn.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(() => positionAnchorMenu(newFileBtn, newMenu, 196));
        newMenuOutsideListener = onNewMenuOutside;
        newMenuKeyListener = onNewMenuKeyDown;
        document.addEventListener('pointerdown', newMenuOutsideListener, true);
        document.addEventListener('keydown', newMenuKeyListener);
    };

    const renderEmptyPreview = (): void => {
        previewBody.replaceChildren();
        breadcrumb.replaceChildren();
        const rootCrumb = document.createElement('span');
        rootCrumb.className = 'theia-mobile-transcript-files-crumb theia-mod-root';
        rootCrumb.textContent = rootLabel;
        breadcrumb.append(rootCrumb);
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-transcript-files-empty';
        empty.textContent = services.localize(
            'qaap/mobileProjects/filesPickFile',
            'Select a file to preview its contents.',
        );
        previewBody.append(empty);
    };

    const renderPreviewHeader = (entry: TranscriptFileTreeEntry): void => {
        breadcrumb.replaceChildren();
        const rootCrumb = document.createElement('span');
        rootCrumb.className = 'theia-mobile-transcript-files-crumb theia-mod-root';
        rootCrumb.textContent = rootLabel;
        breadcrumb.append(rootCrumb);
        const parts = entry.relativePath.split('/').filter(Boolean);
        const fileName = parts.pop() ?? entry.name;
        if (parts.length > 0) {
            const sep = document.createElement('span');
            sep.className = 'theia-mobile-transcript-files-crumb-sep';
            sep.textContent = '›';
            breadcrumb.append(sep);
            const dirCrumb = document.createElement('span');
            dirCrumb.className = 'theia-mobile-transcript-files-crumb theia-mod-dir';
            dirCrumb.textContent = parts.join(' › ');
            breadcrumb.append(dirCrumb);
        }
        const sep = document.createElement('span');
        sep.className = 'theia-mobile-transcript-files-crumb-sep';
        sep.textContent = '›';
        const fileCrumb = document.createElement('span');
        fileCrumb.className = 'theia-mobile-transcript-files-crumb theia-mod-file';
        fileCrumb.textContent = fileName;
        breadcrumb.append(sep, fileCrumb);
    };

    const renderPreviewLoading = (): void => {
        previewBody.replaceChildren();
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-transcript-files-loading';
        loading.textContent = services.localize('qaap/mobileProjects/filesLoading', 'Loading…');
        previewBody.append(loading);
    };

    const renderPreviewError = (message: string): void => {
        previewBody.replaceChildren();
        const error = document.createElement('div');
        error.className = 'theia-mobile-transcript-files-error';
        error.textContent = message;
        previewBody.append(error);
    };

    const clearPreviewSaveTimer = (): void => {
        if (state.previewSaveTimer !== undefined) {
            window.clearTimeout(state.previewSaveTimer);
            state.previewSaveTimer = undefined;
        }
    };

    const savePreviewText = async (): Promise<void> => {
        clearPreviewSaveTimer();
        syncPreviewTextFromEditor();
        if (!state.previewDirty || !state.selected) {
            return;
        }
        if (state.previewMonacoEditor && !state.previewMonacoEditor.readOnly) {
            try {
                await state.previewMonacoEditor.save();
                state.previewDirty = false;
            } catch {
                renderPreviewError(services.localize(
                    'qaap/mobileProjects/filesWriteFailed',
                    'Could not save {0}',
                    state.selected.relativePath,
                ));
            }
            return;
        }
        if (!services.writeFile || state.previewText === undefined) {
            return;
        }
        try {
            await services.writeFile(state.selected.resourcePath, state.previewText);
            state.previewDirty = false;
        } catch {
            renderPreviewError(services.localize(
                'qaap/mobileProjects/filesWriteFailed',
                'Could not save {0}',
                state.selected.relativePath,
            ));
        }
    };

    const schedulePreviewSave = (): void => {
        clearPreviewSaveTimer();
        state.previewSaveTimer = window.setTimeout(() => {
            state.previewSaveTimer = undefined;
            void savePreviewText();
        }, 500);
    };

    const syncPreviewTextFromEditor = (): void => {
        const text = state.previewMonacoEditor?.getText();
        if (text !== undefined) {
            state.previewText = text;
        }
    };

    const disposePreviewMonacoEditor = (): string | undefined => {
        syncPreviewTextFromEditor();
        const text = state.previewText;
        if (state.previewMonacoEditor) {
            state.previewMonacoEditor.dispose();
            state.previewMonacoEditor = undefined;
        }
        return text;
    };

    const isMarkdownPreviewFile = (path: string): boolean => {
        const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
        return ['md', 'mdx', 'markdown'].includes(ext);
    };

    const renderPreviewReadOnlyFallback = (entry: TranscriptFileTreeEntry, text: string): void => {
        const language = resolveTranscriptCodeLanguage(entry.relativePath, text);
        previewBody.append(createTranscriptCodeView(text, language));
    };

    const attachPreviewMonacoEditor = (
        entry: TranscriptFileTreeEntry,
        editor: TranscriptPreviewMonacoEditor,
        requestId: number,
    ): void => {
        state.previewMonacoEditor = editor;
        state.previewText = editor.getText();
        disposables.push(Disposable.create(() => {
            if (state.previewMonacoEditor === editor) {
                disposePreviewMonacoEditor();
            } else {
                editor.dispose();
            }
        }));
        if (!editor.readOnly) {
            disposables.push(editor.onDidChangeContent(() => {
                if (requestId !== state.previewEditorRequestId) {
                    return;
                }
                syncPreviewTextFromEditor();
                state.previewDirty = true;
                schedulePreviewSave();
            }));
        }
        window.requestAnimationFrame(() => editor.layout());
    };

    const renderPreviewMonaco = async (
        entry: TranscriptFileTreeEntry,
        text: string,
        options: TranscriptPreviewMonacoEditorOptions,
    ): Promise<void> => {
        if (!services.createMonacoPreviewEditor) {
            previewBody.replaceChildren();
            renderPreviewReadOnlyFallback(entry, text);
            return;
        }
        const requestId = ++state.previewEditorRequestId;
        disposePreviewMonacoEditor();
        previewBody.classList.toggle('theia-mod-editing', !options.readOnly);
        previewBody.replaceChildren();
        const host = document.createElement('div');
        host.className = 'theia-mobile-transcript-files-monaco-host';
        previewBody.append(host);
        try {
            const editor = await services.createMonacoPreviewEditor(host, entry.resourcePath, {
                ...options,
                initialText: text,
            });
            if (!editor || requestId !== state.previewEditorRequestId) {
                editor?.dispose();
                return;
            }
            if (options.readOnly !== editor.readOnly) {
                editor.dispose();
                return;
            }
            if (!options.readOnly && !state.previewEditable) {
                editor.dispose();
                return;
            }
            if (options.readOnly && state.previewEditable) {
                editor.dispose();
                return;
            }
            attachPreviewMonacoEditor(entry, editor, requestId);
        } catch {
            if (requestId !== state.previewEditorRequestId) {
                return;
            }
            if (!options.readOnly) {
                state.previewEditable = false;
                renderPreviewError(services.localize(
                    'qaap/mobileProjects/filesEditorFailed',
                    'Could not open editor for {0}',
                    entry.relativePath,
                ));
                syncTreeLayout();
                return;
            }
            previewBody.classList.remove('theia-mod-editing');
            previewBody.replaceChildren();
            renderPreviewReadOnlyFallback(entry, text);
        }
    };

    const renderPreviewReadOnly = (entry: TranscriptFileTreeEntry, text: string): void => {
        disposePreviewMonacoEditor();
        previewBody.classList.remove('theia-mod-editing');
        previewBody.replaceChildren();
        if (isMarkdownPreviewFile(entry.relativePath) && services.renderMarkdownPreview) {
            const markdownHost = services.renderMarkdownPreview(entry.resourcePath, text);
            markdownHost.classList.add('theia-mobile-agent-transcript-content', 'theia-mod-markdown');
            previewBody.append(markdownHost);
            return;
        }
        void renderPreviewMonaco(entry, text, { readOnly: true });
    };

    const renderPreviewMonacoEditor = async (
        entry: TranscriptFileTreeEntry,
        text: string,
        shouldFocus = false,
    ): Promise<void> => {
        await renderPreviewMonaco(entry, text, { readOnly: false, focus: shouldFocus });
    };

    const renderPreviewContent = (entry: TranscriptFileTreeEntry, text: string, shouldFocusEditor = false): void => {
        state.previewText = text;
        if (state.previewEditable) {
            void renderPreviewMonacoEditor(entry, text, shouldFocusEditor);
        } else {
            renderPreviewReadOnly(entry, text);
        }
    };

    const loadPreview = async (entry: TranscriptFileTreeEntry): Promise<void> => {
        if (state.previewEditable || state.previewDirty) {
            await savePreviewText();
        }
        disposePreviewMonacoEditor();
        state.previewEditable = false;
        state.previewText = undefined;
        state.previewDirty = false;
        const requestId = ++state.previewRequestId;
        state.selected = entry;
        renderPreviewHeader(entry);
        syncPreviewEditUi();
        if (!isTranscriptPreviewableTextFile(entry.relativePath)) {
            previewBody.replaceChildren();
            const note = document.createElement('div');
            note.className = 'theia-mobile-transcript-files-empty';
            note.textContent = services.localize(
                'qaap/mobileProjects/filesBinaryPreview',
                'Preview is not available for this file type.',
            );
            previewBody.append(note);
            renderTree();
            syncTreeLayout();
            return;
        }
        renderPreviewLoading();
        try {
            const text = await services.readFile(entry.resourcePath);
            if (requestId !== state.previewRequestId) {
                return;
            }
            renderPreviewContent(entry, text);
        } catch {
            if (requestId !== state.previewRequestId) {
                return;
            }
            renderPreviewError(services.localize(
                'qaap/mobileProjects/filesReadFailed',
                'Could not read {0}',
                entry.relativePath,
            ));
        }
        renderTree();
        syncTreeLayout();
    };

    const ensureChildren = async (resourcePath: string): Promise<readonly TranscriptFileTreeEntry[]> => {
        const cached = state.childrenByPath.get(resourcePath);
        if (cached) {
            return cached;
        }
        if (state.loadingPaths.has(resourcePath)) {
            return [];
        }
        state.loadingPaths.add(resourcePath);
        renderTree();
        try {
            const children = await services.listDirectory(resourcePath);
            const sorted = [...children]
                .sort((left, right) => {
                    if (left.isDirectory !== right.isDirectory) {
                        return left.isDirectory ? -1 : 1;
                    }
                    return left.name.localeCompare(right.name);
                })
                .map(child => ({
                    ...child,
                    relativePath: services.relativePathForResource(child.resourcePath, state.rootUri),
                }));
            state.childrenByPath.set(resourcePath, sorted);
            return sorted;
        } catch {
            state.childrenByPath.set(resourcePath, []);
            return [];
        } finally {
            state.loadingPaths.delete(resourcePath);
            renderTree();
        }
    };

    interface TreeRow {
        readonly entry: TranscriptFileTreeEntry;
        readonly depth: number;
    }

    const collectVisibleRows = async (): Promise<TreeRow[]> => {
        if (state.filter.trim()) {
            const all: TranscriptFileTreeEntry[] = [];
            const walk = async (resourcePath: string): Promise<void> => {
                const children = await ensureChildren(resourcePath);
                for (const child of children) {
                    if (child.isDirectory) {
                        if (shouldSkipTranscriptFilesDirectory(child.name)) {
                            continue;
                        }
                        await walk(child.resourcePath);
                        continue;
                    }
                    all.push(child);
                }
            };
            await walk(state.rootUri);
            return filterTranscriptFileTreeEntries(all, state.filter).map(entry => ({
                entry,
                depth: Math.max(0, entry.relativePath.split('/').filter(Boolean).length - 1),
            }));
        }

        const rows: TreeRow[] = [];
        const walk = async (resourcePath: string, depth: number): Promise<void> => {
            const children = await ensureChildren(resourcePath);
            for (const child of children) {
                if (child.isDirectory && shouldSkipTranscriptFilesDirectory(child.name)) {
                    continue;
                }
                rows.push({ entry: child, depth });
                if (child.isDirectory && state.expanded.has(child.resourcePath)) {
                    await walk(child.resourcePath, depth + 1);
                }
            }
        };
        await walk(state.rootUri, 0);
        return rows;
    };

    const createTreeRow = (entry: TranscriptFileTreeEntry, depth: number): HTMLElement => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'theia-mobile-transcript-files-row';
        row.style.setProperty('--qaap-files-depth', String(depth));
        row.dataset.resourcePath = entry.resourcePath;
        if (state.selected?.resourcePath === entry.resourcePath) {
            row.classList.add('theia-mod-active');
        }
        if (entry.isDirectory) {
            row.classList.add('theia-mod-folder');
            if (state.expanded.has(entry.resourcePath)) {
                row.classList.add('theia-mod-expanded');
            }
        }
        const chevron = document.createElement('span');
        chevron.className = entry.isDirectory
            ? `theia-mobile-transcript-files-chevron codicon ${state.expanded.has(entry.resourcePath) ? 'codicon-chevron-down' : 'codicon-chevron-right'}`
            : 'theia-mobile-transcript-files-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('span');
        icon.className = 'theia-mobile-transcript-files-icon';
        icon.setAttribute('aria-hidden', 'true');
        if (services.resolveFileIcon) {
            for (const iconClass of services.resolveFileIcon(entry.resourcePath, entry.isDirectory).split(/\s+/)) {
                if (iconClass) {
                    icon.classList.add(iconClass);
                }
            }
        } else {
            icon.classList.add('codicon', entry.isDirectory ? 'codicon-folder' : transcriptFileIconClass(entry.relativePath));
        }
        const label = document.createElement('span');
        label.className = 'theia-mobile-transcript-files-label';
        label.textContent = entry.name;
        row.append(chevron, icon, label);
        row.addEventListener('click', () => {
            if (entry.isDirectory) {
                if (state.expanded.has(entry.resourcePath)) {
                    state.expanded.delete(entry.resourcePath);
                } else {
                    state.expanded.add(entry.resourcePath);
                    void ensureChildren(entry.resourcePath);
                }
                void renderTree();
                return;
            }
            void loadPreview(entry);
        });
        return row;
    };

    let renderTreeInFlight = false;
    let renderTreeQueued = false;
    const renderTree = async (): Promise<void> => {
        if (renderTreeInFlight) {
            renderTreeQueued = true;
            return;
        }
        renderTreeInFlight = true;
        try {
            const rows = await collectVisibleRows();
            treeScroll.replaceChildren();
            if (rows.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'theia-mobile-transcript-files-tree-empty';
                empty.textContent = state.filter.trim()
                    ? services.localize('qaap/mobileProjects/filesNoMatches', 'No matching files.')
                    : services.localize('qaap/mobileProjects/filesEmptyTree', 'This workspace folder is empty.');
                treeScroll.append(empty);
                return;
            }
            for (const row of rows) {
                treeScroll.append(createTreeRow(row.entry, row.depth));
            }
        } finally {
            renderTreeInFlight = false;
            if (renderTreeQueued) {
                renderTreeQueued = false;
                void renderTree();
            }
        }
    };

    const onFilterInput = (): void => {
        state.filter = filterInput.value;
        void renderTree();
    };
    filterInput.addEventListener('input', onFilterInput);
    disposables.push(Disposable.create(() => filterInput.removeEventListener('input', onFilterInput)));

    const resolveNewItemParentPath = (): string | undefined => {
        if (state.selected) {
            if (state.selected.isDirectory) {
                return state.selected.resourcePath;
            }
            const slash = state.selected.resourcePath.lastIndexOf('/');
            if (slash > 'file://'.length) {
                return state.selected.resourcePath.slice(0, slash);
            }
        }
        return state.rootUri;
    };

    const prepareCreateInParent = (parentPath: string | undefined): void => {
        if (!parentPath) {
            return;
        }
        state.expanded.add(parentPath);
        state.childrenByPath.delete(parentPath);
    };

    const runCreateNewFile = (): void => {
        if (!services.createNewFile) {
            return;
        }
        const parent = resolveNewItemParentPath();
        prepareCreateInParent(parent);
        closeNewMenu();
        services.createNewFile(parent);
    };

    const runCreateNewFolder = (): void => {
        if (!services.createNewFolder) {
            return;
        }
        const parent = resolveNewItemParentPath();
        prepareCreateInParent(parent);
        closeNewMenu();
        services.createNewFolder(parent);
    };

    const onNewMenuItemActivate = (event: Event, run: () => void): void => {
        event.preventDefault();
        event.stopPropagation();
        run();
    };

    const onNewPointerDown = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        openNewMenu();
    };
    const onNewFileItemPointerDown = (event: PointerEvent): void => {
        onNewMenuItemActivate(event, runCreateNewFile);
    };
    const onNewFolderItemPointerDown = (event: PointerEvent): void => {
        onNewMenuItemActivate(event, runCreateNewFolder);
    };
    newFileBtn.addEventListener('pointerdown', onNewPointerDown);
    disposables.push(Disposable.create(() => newFileBtn.removeEventListener('pointerdown', onNewPointerDown)));

    newFileItem.addEventListener('pointerdown', onNewFileItemPointerDown);
    disposables.push(Disposable.create(() => newFileItem.removeEventListener('pointerdown', onNewFileItemPointerDown)));

    newFolderItem.addEventListener('pointerdown', onNewFolderItemPointerDown);
    disposables.push(Disposable.create(() => newFolderItem.removeEventListener('pointerdown', onNewFolderItemPointerDown)));

    let splitDragSession: {
        readonly stacked: boolean;
        readonly startCoord: number;
        readonly startSize: number;
        readonly pointerId?: number;
        readonly touchId?: number;
    } | undefined;

    const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;

    const updateSplitDrag = (clientX: number, clientY: number): void => {
        if (!splitDragSession) {
            return;
        }
        const { stacked, startCoord, startSize } = splitDragSession;
        const layoutRect = layout.getBoundingClientRect();
        const maxSize = Math.max(
            FILES_TREE_MIN_PX,
            (stacked ? layoutRect.height : layoutRect.width) * FILES_TREE_MAX_RATIO,
        );
        const delta = stacked
            ? clientY - startCoord
            : clientX - startCoord;
        const nextSize = Math.min(maxSize, Math.max(FILES_TREE_MIN_PX, startSize - delta));
        if (stacked) {
            state.treePaneHeightPx = nextSize;
        } else {
            state.treePaneWidthPx = nextSize;
        }
        applyTreePaneSize();
    };

    const onSplitPointerMove = (event: PointerEvent): void => {
        if (!splitDragSession || splitDragSession.pointerId !== event.pointerId) {
            return;
        }
        event.preventDefault();
        updateSplitDrag(event.clientX, event.clientY);
    };

    const onSplitPointerEnd = (event: PointerEvent): void => {
        if (!splitDragSession || splitDragSession.pointerId !== event.pointerId) {
            return;
        }
        endSplitResize();
    };

    const onSplitTouchMove = (event: TouchEvent): void => {
        if (!splitDragSession || splitDragSession.touchId === undefined) {
            return;
        }
        const touch = Array.from(event.touches).find(entry => entry.identifier === splitDragSession?.touchId);
        if (!touch) {
            return;
        }
        if (event.cancelable) {
            event.preventDefault();
        }
        updateSplitDrag(touch.clientX, touch.clientY);
    };

    const onSplitTouchEnd = (event: TouchEvent): void => {
        if (!splitDragSession || splitDragSession.touchId === undefined) {
            return;
        }
        const ended = Array.from(event.changedTouches).some(entry => entry.identifier === splitDragSession?.touchId);
        if (ended) {
            endSplitResize();
        }
    };

    const endSplitResize = (): void => {
        if (!splitDragSession) {
            return;
        }
        const session = splitDragSession;
        splitDragSession = undefined;
        layout.classList.remove('theia-mod-resizing');
        if (session.pointerId !== undefined) {
            try {
                splitHandle.releasePointerCapture(session.pointerId);
            } catch {
                /* Safari may already have released capture */
            }
        }
        document.removeEventListener('pointermove', onSplitPointerMove, true);
        document.removeEventListener('pointerup', onSplitPointerEnd, true);
        document.removeEventListener('pointercancel', onSplitPointerEnd, true);
        document.removeEventListener('touchmove', onSplitTouchMove, true);
        document.removeEventListener('touchend', onSplitTouchEnd, true);
        document.removeEventListener('touchcancel', onSplitTouchEnd, true);
    };

    const beginSplitResize = (
        clientX: number,
        clientY: number,
        pointerId?: number,
        touchId?: number,
    ): void => {
        if (splitDragSession) {
            return;
        }
        const stacked = isTreeStacked();
        const measured = stacked ? treePane.getBoundingClientRect().height : treePane.getBoundingClientRect().width;
        const startSize = stacked
            ? (state.treePaneHeightPx ?? measured)
            : (state.treePaneWidthPx ?? measured);
        splitDragSession = {
            stacked,
            startCoord: stacked ? clientY : clientX,
            startSize,
            pointerId,
            touchId,
        };
        layout.classList.add('theia-mod-resizing');
        if (pointerId !== undefined) {
            try {
                splitHandle.setPointerCapture(pointerId);
            } catch {
                /* ignore capture failures; document listeners still handle the drag */
            }
            document.addEventListener('pointermove', onSplitPointerMove, { capture: true, passive: false });
            document.addEventListener('pointerup', onSplitPointerEnd, { capture: true });
            document.addEventListener('pointercancel', onSplitPointerEnd, { capture: true });
        }
        if (touchId !== undefined) {
            document.addEventListener('touchmove', onSplitTouchMove, { capture: true, passive: false });
            document.addEventListener('touchend', onSplitTouchEnd, { capture: true });
            document.addEventListener('touchcancel', onSplitTouchEnd, { capture: true });
        }
    };

    const onSplitPointerDown = (event: PointerEvent): void => {
        if (!state.treeVisible) {
            return;
        }
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        beginSplitResize(event.clientX, event.clientY, event.pointerId);
    };

    const onSplitTouchStart = (event: TouchEvent): void => {
        if (!state.treeVisible || splitDragSession) {
            return;
        }
        if (event.touches.length !== 1) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const touch = event.touches[0];
        beginSplitResize(touch.clientX, touch.clientY, undefined, touch.identifier);
    };

    splitHandle.addEventListener('pointerdown', onSplitPointerDown);
    if (!supportsPointerEvents) {
        splitHandle.addEventListener('touchstart', onSplitTouchStart, { passive: false });
    }
    disposables.push(Disposable.create(() => {
        splitHandle.removeEventListener('pointerdown', onSplitPointerDown);
        if (!supportsPointerEvents) {
            splitHandle.removeEventListener('touchstart', onSplitTouchStart);
        }
        endSplitResize();
    }));

    const onMorePointerDown = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        openMoreMenu();
    };
    moreBtn.addEventListener('pointerdown', onMorePointerDown);
    disposables.push(Disposable.create(() => moreBtn.removeEventListener('pointerdown', onMorePointerDown)));

    const setPreviewEditable = (editable: boolean): void => {
        if (!state.selected || state.selected.isDirectory || !services.writeFile || !services.createMonacoPreviewEditor) {
            return;
        }
        if (state.previewEditable === editable) {
            return;
        }
        const entry = state.selected;
        if (!editable) {
            const text = disposePreviewMonacoEditor() ?? state.previewText;
            state.previewEditable = false;
            syncTreeLayout();
            if (text !== undefined) {
                state.previewText = text;
                renderPreviewReadOnly(entry, text);
            }
            void savePreviewText();
            return;
        }
        state.previewEditable = true;
        syncTreeLayout();
        const cachedText = state.previewText;
        if (cachedText !== undefined) {
            renderPreviewContent(entry, cachedText, true);
            return;
        }
        renderPreviewLoading();
        void services.readFile(entry.resourcePath).then(text => {
            if (!state.previewEditable || state.selected?.resourcePath !== entry.resourcePath) {
                return;
            }
            renderPreviewContent(entry, text, true);
        }).catch(() => {
            if (!state.previewEditable || state.selected?.resourcePath !== entry.resourcePath) {
                return;
            }
            state.previewEditable = false;
            renderPreviewError(services.localize(
                'qaap/mobileProjects/filesReadFailed',
                'Could not read {0}',
                entry.relativePath,
            ));
            syncTreeLayout();
        });
    };

    const onMenuItemActivate = (event: Event, run: () => void): void => {
        event.preventDefault();
        event.stopPropagation();
        run();
    };

    const onPreviewEditActivate = (event: Event): void => {
        if (editFileBtn.disabled) {
            return;
        }
        onMenuItemActivate(event, () => setPreviewEditable(!state.previewEditable));
    };

    editToggleBtn.addEventListener('pointerdown', onPreviewEditActivate);
    editFileBtn.addEventListener('pointerdown', onPreviewEditActivate);
    disposables.push(Disposable.create(() => {
        editToggleBtn.removeEventListener('pointerdown', onPreviewEditActivate);
        editFileBtn.removeEventListener('pointerdown', onPreviewEditActivate);
    }));

    const onTreeSidePointerDown = (event: PointerEvent): void => {
        onMenuItemActivate(event, () => {
            setTreePosition('side');
            closeMoreMenu();
        });
    };
    treeSideBtn.addEventListener('pointerdown', onTreeSidePointerDown);
    disposables.push(Disposable.create(() => treeSideBtn.removeEventListener('pointerdown', onTreeSidePointerDown)));

    const onTreeBottomPointerDown = (event: PointerEvent): void => {
        onMenuItemActivate(event, () => {
            setTreePosition('bottom');
            closeMoreMenu();
        });
    };
    treeBottomBtn.addEventListener('pointerdown', onTreeBottomPointerDown);
    disposables.push(Disposable.create(() => treeBottomBtn.removeEventListener('pointerdown', onTreeBottomPointerDown)));

    const onTreeShowPointerDown = (event: PointerEvent): void => {
        onMenuItemActivate(event, () => setTreeVisible(!state.treeVisible));
    };
    treeShowBtn.addEventListener('pointerdown', onTreeShowPointerDown);
    disposables.push(Disposable.create(() => treeShowBtn.removeEventListener('pointerdown', onTreeShowPointerDown)));

    disposables.push(Disposable.create(() => {
        closeAllMenus();
    }));

    if (services.watchFileTreeChanges) {
        disposables.push(services.watchFileTreeChanges(() => {
            state.childrenByPath.clear();
            void renderTree();
        }));
    }

    const onWindowResize = (): void => {
        if (moreMenuOpen) {
            positionAnchorMenu(moreBtn, moreMenu);
        }
        if (newMenuOpen) {
            positionAnchorMenu(newFileBtn, newMenu, 196);
        }
        updateSplitHandleAria();
        applyTreePaneSize();
        state.previewMonacoEditor?.layout();
    };
    window.addEventListener('resize', onWindowResize);
    disposables.push(Disposable.create(() => window.removeEventListener('resize', onWindowResize)));

    renderEmptyPreview();
    void ensureChildren(state.rootUri).then(async children => {
        await renderTree();
        if (!state.selected) {
            const readme = findTranscriptReadmeEntry(children);
            if (readme) {
                await loadPreview(readme);
            }
        }
    });

    disposables.push(Disposable.create(() => {
        clearPreviewSaveTimer();
        void savePreviewText();
        disposePreviewMonacoEditor();
        state.previewRequestId++;
        root.remove();
    }));

    return { root, dispose: disposables };
}
