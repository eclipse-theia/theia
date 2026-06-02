// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { addEventListener, codiconArray } from '@theia/core/lib/browser/widgets/widget';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { MiniBrowserProps } from '@theia/mini-browser/lib/browser/mini-browser-content';
import { normalizeMiniBrowserOpenUrl } from '@theia/mini-browser/lib/browser/mini-browser-url-utils';
import { QaapAgentPreviewChromeStyle as Style } from './qaap-agent-preview-chrome-style';
import { normalizePreviewUrlForSameOrigin } from './qaap-preview-url-utils';
import {
    QaapPreviewInlineInspector,
    setPreviewInspectorPosition,
    type QaapPreviewInspectorDeps,
    wirePreviewInspectorResize,
} from './qaap-preview-inline-inspector';
import {
    QaapPreviewSurfaceHandle,
    QaapPreviewSurfaceRegistry,
} from './qaap-preview-surface-registry';
import {
    clearPreviewBrowsingHistory,
    faviconUrlForPreview,
    groupPreviewBrowsingHistory,
    previewHistoryEntryLabel,
    readPreviewBookmarkBarVisible,
    readPreviewBrowsingHistory,
    readPreviewHistoryPanelWidth,
    recordPreviewBrowsingVisit,
    writePreviewBookmarkBarVisible,
    writePreviewHistoryPanelWidth,
    clampPreviewHistoryPanelWidth,
    type QaapPreviewHistoryEntry,
} from './qaap-preview-browsing-history';
import {
    mountPreviewOverflowMenu,
    previewNotify,
} from './qaap-preview-overflow-actions';

export interface QaapAgentPreviewChromeHost {
    getRoot(): HTMLElement;
    getFrame(): HTMLIFrameElement | undefined;
    getCurrentUrl(): string;
    getPageTitle(): string | undefined;
    navigate(url: string, options?: { hard?: boolean }): void | Promise<void>;
    reload(): void;
    hardReload(): void;
    openExternal(): void;
    copyCurrentUrl(): Promise<void>;
    takeScreenshot?(): void | Promise<void>;
    onPickElement?(): void;
    onToggleInspector?(): void;
    setInspectorPosition?(position: 'side' | 'bottom'): void;
}

export interface QaapAgentPreviewChromeOptions {
    readonly clipboard?: ClipboardService;
    readonly messageService?: MessageService;
    readonly embedded?: boolean;
    /** Extra toast feedback (e.g. mobile snackbar). */
    readonly notify?: (message: string, kind?: 'info' | 'warn') => void;
}

/** Cursor-style preview chrome: browsing history drawer + overflow menu. */
export class QaapAgentPreviewChromeController implements Disposable {
    protected readonly toDispose = new DisposableCollection();
    protected historyOpen = false;
    protected bookmarkBarVisible = readPreviewBookmarkBarVisible();
    protected bookmarkBar: HTMLElement | undefined;
    protected historyRoot: HTMLElement | undefined;
    protected historyList: HTMLElement | undefined;
    protected historySearchInput: HTMLInputElement | undefined;
    protected overflowMenu: HTMLElement | undefined;
    protected overflowMenuDispose: (() => void) | undefined;
    protected historyButton: HTMLButtonElement | undefined;
    protected historyPanel: HTMLElement | undefined;
    protected historyResizePointerId: number | undefined;

    constructor(
        protected readonly host: QaapAgentPreviewChromeHost,
        protected readonly options: QaapAgentPreviewChromeOptions = {},
    ) {
        const root = host.getRoot();
        root.classList.add(Style.ROOT);
        if (options.embedded) {
            root.classList.add(Style.MOD_EMBEDDED);
        } else {
            root.classList.add(Style.MOD_MINI_BROWSER);
        }
        this.ensureBookmarkBar(root);
        this.ensureHistoryDrawer(root);
        this.toDispose.push(Disposable.create(() => {
            root.classList.remove(Style.ROOT, Style.MOD_EMBEDDED, Style.MOD_MINI_BROWSER, Style.HISTORY_OPEN);
            this.historyRoot?.remove();
            this.bookmarkBar?.remove();
            this.overflowMenu?.remove();
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /** Toolbar buttons for mini-browser (history + overflow). */
    attachToolbarControls(toolbar: HTMLElement, beforeFirst?: HTMLElement): void {
        const historyBtn = this.createToolbarIconButton(
            nls.localize('qaap/preview/openHistory', 'Show browsing history'),
            'history',
            Style.TOOLBAR_HISTORY,
        );
        this.historyButton = historyBtn;
        this.toDispose.push(addEventListener(historyBtn, 'click', () => this.toggleHistory()));

        const overflowBtn = this.createToolbarIconButton(
            nls.localize('qaap/preview/moreActions', 'More preview actions'),
            'kebab-vertical',
            Style.TOOLBAR_OVERFLOW,
        );
        this.toDispose.push(addEventListener(overflowBtn, 'click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleOverflowMenu(overflowBtn);
        }));

        if (beforeFirst) {
            toolbar.insertBefore(historyBtn, beforeFirst);
            toolbar.appendChild(overflowBtn);
        } else {
            toolbar.insertBefore(historyBtn, toolbar.firstChild);
            toolbar.appendChild(overflowBtn);
        }
    }

    recordVisit(): void {
        const url = this.host.getCurrentUrl();
        if (!url) {
            return;
        }
        recordPreviewBrowsingVisit(url, this.host.getPageTitle());
        this.refreshBookmarkBar();
        if (this.historyOpen) {
            this.renderHistoryList();
        }
    }

    toggleHistory(open?: boolean): void {
        this.historyOpen = open ?? !this.historyOpen;
        const root = this.host.getRoot();
        root.classList.toggle(Style.HISTORY_OPEN, this.historyOpen);
        if (this.historyRoot) {
            this.historyRoot.hidden = !this.historyOpen;
        }
        if (this.historyOpen) {
            if (this.historyPanel) {
                this.applyHistoryPanelWidth(this.historyPanel);
            }
            this.renderHistoryList();
            this.historySearchInput?.focus();
        }
    }

    protected ensureBookmarkBar(root: HTMLElement): void {
        const bar = document.createElement('div');
        bar.className = Style.BOOKMARK_BAR;
        bar.hidden = !this.bookmarkBarVisible;
        const toolbar = root.querySelector('.theia-mini-browser-toolbar, .theia-mini-browser-toolbar-read-only, .qaap-agent-preview-embedded-toolbar');
        if (toolbar?.parentElement) {
            toolbar.parentElement.insertBefore(bar, toolbar.nextSibling);
        } else {
            root.prepend(bar);
        }
        this.bookmarkBar = bar;
        this.refreshBookmarkBar();
    }

    protected refreshBookmarkBar(): void {
        if (!this.bookmarkBar) {
            return;
        }
        this.bookmarkBar.replaceChildren();
        if (!this.bookmarkBarVisible) {
            return;
        }
        const seen = new Set<string>();
        for (const entry of readPreviewBrowsingHistory()) {
            if (seen.has(entry.url)) {
                continue;
            }
            seen.add(entry.url);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = Style.BOOKMARK_ITEM;
            btn.title = entry.url;
            btn.textContent = previewHistoryEntryLabel(entry);
            this.toDispose.push(addEventListener(btn, 'click', () => {
                void this.host.navigate(entry.url);
                this.toggleHistory(false);
            }));
            this.bookmarkBar.appendChild(btn);
            if (seen.size >= 8) {
                break;
            }
        }
    }

    protected ensureHistoryDrawer(root: HTMLElement): void {
        const historyRoot = document.createElement('div');
        historyRoot.className = Style.HISTORY;
        historyRoot.hidden = true;

        const backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.className = Style.HISTORY_BACKDROP;
        backdrop.setAttribute('aria-label', nls.localize('qaap/preview/closeHistory', 'Close history'));
        this.toDispose.push(addEventListener(backdrop, 'click', () => this.toggleHistory(false)));

        const panel = document.createElement('aside');
        panel.className = Style.HISTORY_PANEL;
        panel.setAttribute('role', 'navigation');
        panel.setAttribute('aria-label', nls.localize('qaap/preview/historyTitle', 'Browsing history'));
        this.applyHistoryPanelWidth(panel);

        const panelBody = document.createElement('div');
        panelBody.className = Style.HISTORY_PANEL_BODY;

        const search = document.createElement('input');
        search.type = 'search';
        search.className = `${Style.HISTORY_SEARCH} theia-input`;
        search.placeholder = nls.localize('qaap/preview/historySearch', 'Search');
        search.spellcheck = false;
        this.historySearchInput = search;
        this.toDispose.push(addEventListener(search, 'input', () => this.renderHistoryList()));

        const list = document.createElement('div');
        list.className = 'qaap-agent-preview-history-list';
        this.historyList = list;

        panelBody.append(search, list);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = Style.HISTORY_RESIZE_HANDLE;
        resizeHandle.setAttribute('role', 'separator');
        resizeHandle.setAttribute('aria-orientation', 'vertical');
        resizeHandle.setAttribute('aria-label', nls.localize('qaap/preview/resizeHistory', 'Resize browsing history panel'));
        resizeHandle.tabIndex = 0;
        this.installHistoryPanelResize(panel, resizeHandle);

        panel.append(panelBody, resizeHandle);
        this.toDispose.push(addEventListener(panel, 'pointerdown', (e: PointerEvent) => e.stopPropagation()));
        historyRoot.append(backdrop, panel);
        this.historyPanel = panel;
        const contentAnchor = root.querySelector(
            '.theia-mini-browser-content-area, .qaap-agent-preview-embedded-body',
        );
        if (contentAnchor instanceof HTMLElement) {
            contentAnchor.appendChild(historyRoot);
        } else {
            root.appendChild(historyRoot);
        }
        this.historyRoot = historyRoot;

        const onKey = (e: KeyboardEvent): void => {
            if (e.key === 'Escape' && this.historyOpen) {
                this.toggleHistory(false);
            }
        };
        window.addEventListener('keydown', onKey);
        this.toDispose.push(Disposable.create(() => window.removeEventListener('keydown', onKey)));
    }

    protected historyPanelContainerWidth(): number | undefined {
        const anchor = this.historyRoot?.parentElement;
        return anchor?.clientWidth;
    }

    protected applyHistoryPanelWidth(panel: HTMLElement, widthPx?: number): void {
        const containerWidth = this.historyPanelContainerWidth();
        const width = widthPx !== undefined
            ? clampPreviewHistoryPanelWidth(widthPx, containerWidth)
            : readPreviewHistoryPanelWidth(containerWidth);
        panel.style.width = `${width}px`;
        panel.style.maxWidth = 'none';
    }

    protected installHistoryPanelResize(panel: HTMLElement, handle: HTMLElement): void {
        let dragStartX = 0;
        let dragStartWidth = 0;

        const stopDrag = (e: PointerEvent): void => {
            if (this.historyResizePointerId === undefined || e.pointerId !== this.historyResizePointerId) {
                return;
            }
            try {
                handle.releasePointerCapture(e.pointerId);
            } catch {
                /* already released */
            }
            this.historyResizePointerId = undefined;
            document.body.classList.remove(Style.HISTORY_RESIZING);
            writePreviewHistoryPanelWidth(panel.getBoundingClientRect().width, this.historyPanelContainerWidth());
        };

        const onPointerMove = (e: PointerEvent): void => {
            if (this.historyResizePointerId === undefined || e.pointerId !== this.historyResizePointerId) {
                return;
            }
            const delta = e.clientX - dragStartX;
            this.applyHistoryPanelWidth(panel, dragStartWidth + delta);
        };

        this.toDispose.push(addEventListener(handle, 'pointerdown', (e: PointerEvent) => {
            if (e.button !== 0) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            dragStartX = e.clientX;
            dragStartWidth = panel.getBoundingClientRect().width;
            this.historyResizePointerId = e.pointerId;
            handle.setPointerCapture(e.pointerId);
            document.body.classList.add(Style.HISTORY_RESIZING);
        }));
        this.toDispose.push(addEventListener(handle, 'pointermove', onPointerMove));
        this.toDispose.push(addEventListener(handle, 'pointerup', stopDrag));
        this.toDispose.push(addEventListener(handle, 'pointercancel', stopDrag));
        this.toDispose.push(addEventListener(handle, 'lostpointercapture', () => {
            if (this.historyResizePointerId === undefined) {
                return;
            }
            this.historyResizePointerId = undefined;
            document.body.classList.remove(Style.HISTORY_RESIZING);
            writePreviewHistoryPanelWidth(panel.getBoundingClientRect().width, this.historyPanelContainerWidth());
        }));

        this.toDispose.push(addEventListener(handle, 'keydown', (e: KeyboardEvent) => {
            const step = e.shiftKey ? 32 : 16;
            const containerWidth = this.historyPanelContainerWidth();
            const current = panel.getBoundingClientRect().width;
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                this.applyHistoryPanelWidth(panel, current + step);
                writePreviewHistoryPanelWidth(panel.getBoundingClientRect().width, containerWidth);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.applyHistoryPanelWidth(panel, current - step);
                writePreviewHistoryPanelWidth(panel.getBoundingClientRect().width, containerWidth);
            }
        }));
    }

    protected renderHistoryList(): void {
        if (!this.historyList || !this.historyRoot) {
            return;
        }
        this.historyRoot.hidden = !this.historyOpen;
        const query = this.historySearchInput?.value.trim().toLowerCase() ?? '';
        const entries = readPreviewBrowsingHistory().filter(entry => {
            if (!query) {
                return true;
            }
            const label = previewHistoryEntryLabel(entry).toLowerCase();
            return label.includes(query) || entry.url.toLowerCase().includes(query);
        });
        this.historyList.replaceChildren();
        const sections = groupPreviewBrowsingHistory(entries);
        if (!sections.length) {
            const empty = document.createElement('div');
            empty.className = Style.HISTORY_EMPTY;
            empty.textContent = nls.localize('qaap/preview/historyEmpty', 'No pages visited yet.');
            this.historyList.append(empty);
            return;
        }
        for (const section of sections) {
            const sectionEl = document.createElement('section');
            sectionEl.className = Style.HISTORY_SECTION;
            const title = document.createElement('div');
            title.className = Style.HISTORY_SECTION_TITLE;
            title.textContent = nls.localize(section.labelKey, section.defaultLabel);
            sectionEl.append(title);
            for (const entry of section.entries) {
                sectionEl.append(this.createHistoryItem(entry));
            }
            this.historyList.append(sectionEl);
        }
    }

    protected createHistoryItem(entry: QaapPreviewHistoryEntry): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = Style.HISTORY_ITEM;
        const icon = document.createElement('img');
        icon.className = Style.HISTORY_ITEM_ICON;
        icon.alt = '';
        icon.loading = 'lazy';
        const favicon = faviconUrlForPreview(entry.url);
        if (favicon) {
            icon.src = favicon;
        } else {
            icon.hidden = true;
        }
        const label = document.createElement('span');
        label.className = Style.HISTORY_ITEM_LABEL;
        label.textContent = previewHistoryEntryLabel(entry);
        btn.append(icon, label);
        this.toDispose.push(addEventListener(btn, 'click', () => {
            void this.host.navigate(entry.url);
            this.toggleHistory(false);
        }));
        return btn;
    }

    protected toggleOverflowMenu(anchor: HTMLElement): void {
        if (this.overflowMenu) {
            this.closeOverflowMenu();
            return;
        }
        const mounted = mountPreviewOverflowMenu({
            anchor,
            bookmarkBarVisible: () => this.bookmarkBarVisible,
            getContext: () => this.createOverflowActionContext(),
            onClose: () => this.closeOverflowMenu(),
        });
        this.overflowMenu = mounted.menu;
        this.overflowMenuDispose = mounted.dispose;
    }

    protected createOverflowActionContext() {
        return {
            getFrame: () => this.host.getFrame(),
            getCurrentUrl: () => this.host.getCurrentUrl(),
            reload: () => this.host.reload(),
            hardReload: () => this.host.hardReload(),
            openExternal: () => this.host.openExternal(),
            copyCurrentUrl: () => this.host.copyCurrentUrl(),
            clipboard: this.options.clipboard,
            messageService: this.options.messageService,
            notify: this.options.notify,
            bookmarkBarVisible: () => this.bookmarkBarVisible,
            toggleBookmarkBar: () => this.toggleBookmarkBar(),
            setInspectorPosition: this.host.setInspectorPosition
                ? (position: 'side' | 'bottom') => this.host.setInspectorPosition?.(position)
                : undefined,
            clearHistory: () => this.clearHistory(),
        };
    }

    protected closeOverflowMenu(): void {
        this.overflowMenuDispose?.();
        this.overflowMenuDispose = undefined;
        this.overflowMenu = undefined;
    }

    protected toggleBookmarkBar(): void {
        this.bookmarkBarVisible = !this.bookmarkBarVisible;
        writePreviewBookmarkBarVisible(this.bookmarkBarVisible);
        if (this.bookmarkBar) {
            this.bookmarkBar.hidden = !this.bookmarkBarVisible;
        }
        this.refreshBookmarkBar();
        previewNotify(
            { messageService: this.options.messageService, notify: this.options.notify },
            this.bookmarkBarVisible
                ? nls.localize('qaap/preview/bookmarkBarOn', 'Bookmark bar shown')
                : nls.localize('qaap/preview/bookmarkBarOff', 'Bookmark bar hidden'),
        );
    }

    protected clearHistory(): void {
        clearPreviewBrowsingHistory();
        this.renderHistoryList();
        this.refreshBookmarkBar();
        previewNotify(
            { messageService: this.options.messageService, notify: this.options.notify },
            nls.localize('qaap/preview/historyCleared', 'Browsing history cleared'),
        );
    }

    protected createToolbarIconButton(title: string, icon: string, className: string): HTMLButtonElement {
        return createQaapPreviewToolbarIconButton(title, icon, className);
    }
}

/** Icon toolbar control matching Qaap preview chrome (codicon, hover pill). */
export function createQaapPreviewToolbarIconButton(title: string, icon: string, className: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.classList.add(className, ...codiconArray(icon));
    return button;
}

export type { QaapPreviewInspectorDeps } from './qaap-preview-inline-inspector';

export interface EmbeddedAgentPreviewChromeOptions extends QaapAgentPreviewChromeOptions {
    readonly url: string;
    readonly readOnlyUrl?: boolean;
    readonly onNavigate?: (url: string) => void;
    readonly openExternal?: (url: string) => void;
    readonly previewSurfaces?: QaapPreviewSurfaceRegistry;
    readonly inspectorDeps?: QaapPreviewInspectorDeps;
    readonly onPickElement?: () => void;
    readonly onToggleInspector?: () => void;
}

export interface EmbeddedAgentPreviewChrome extends Disposable {
    readonly root: HTMLElement;
    readonly frame: HTMLIFrameElement;
    readonly controller: QaapAgentPreviewChromeController;
    setUrl(url: string): void;
    navigate(url: string): void | Promise<void>;
    reload(): void;
}

/** Full preview chrome for embedded hosts (e.g. mobile transcript Preview tab). */
export function mountEmbeddedAgentPreviewChrome(
    host: HTMLElement,
    options: EmbeddedAgentPreviewChromeOptions,
): EmbeddedAgentPreviewChrome {
    const disposables = new DisposableCollection();
    const root = document.createElement('div');
    root.className = 'qaap-agent-preview-embedded';
    host.replaceChildren(root);

    const toolbar = document.createElement('div');
    toolbar.className = 'qaap-agent-preview-embedded-toolbar theia-mini-browser-toolbar';

    const refreshBtn = createQaapPreviewToolbarIconButton(
        nls.localize('theia/mini-browser/reload', 'Reload'),
        'refresh',
        Style.TOOLBAR_REFRESH,
    );
    toolbar.append(refreshBtn);

    const urlField = document.createElement('div');
    urlField.className = 'theia-mini-browser-url-field';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'theia-input';
    urlInput.spellcheck = false;
    urlInput.readOnly = !!options.readOnlyUrl;
    urlField.append(urlInput);

    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'theia-mini-browser-url-field-go';
    goBtn.textContent = nls.localize('theia/mini-browser/go', 'Go');
    if (!options.readOnlyUrl) {
        urlField.append(goBtn);
    }

    const body = document.createElement('div');
    body.className = 'theia-mini-browser-content-area qaap-agent-preview-embedded-body qaap-preview-content-area';

    const split = document.createElement('div');
    split.className = 'qaap-preview-split';

    const frameSlot = document.createElement('div');
    frameSlot.className = 'qaap-preview-frame-slot';

    const inspectorSlot = document.createElement('aside');
    inspectorSlot.className = 'qaap-preview-inspector-slot';

    const frame = document.createElement('iframe');
    const sandbox = (MiniBrowserProps.SandboxOptions.DEFAULT).map(name => MiniBrowserProps.SandboxOptions[name]);
    frame.sandbox.add(...sandbox);
    frameSlot.append(frame);
    split.append(frameSlot, inspectorSlot);
    body.append(split);
    wirePreviewInspectorResize(split, inspectorSlot, disposables);

    let surfaceHandle: QaapPreviewSurfaceHandle | undefined;
    if (options.previewSurfaces) {
        surfaceHandle = options.previewSurfaces.registerEmbedded(frame, disposables);
    }

    const workbench = document.createElement('div');
    workbench.className = 'theia-mini-browser-workbench-controls';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.title = nls.localize('theia/mini-browser/openInNewBrowserTab', 'Open in New Browser Tab');
    openBtn.classList.add('theia-mini-browser-workbench-button', 'theia-mini-browser-open', ...codiconArray('link-external'));
    workbench.append(openBtn);

    const pickHandler = (): void => {
        if (surfaceHandle) {
            surfaceHandle.picker.startElementPicker();
            return;
        }
        options.onPickElement?.();
    };
    const inspectorHandler = (): void => {
        if (surfaceHandle) {
            void surfaceHandle.picker.openElementInspector();
            return;
        }
        options.onToggleInspector?.();
    };

    let inlineInspector: QaapPreviewInlineInspector | undefined;
    if (options.inspectorDeps) {
        inlineInspector = new QaapPreviewInlineInspector(inspectorSlot, {
            service: options.inspectorDeps.service,
            commands: options.inspectorDeps.commands,
            messageService: options.messageService,
            toDispose: disposables,
        });
        surfaceHandle?.picker.connectInlineInspector(inlineInspector);
    }

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.title = nls.localize('theia/mini-browser/pickElement', 'Pick an element to send to chat');
    pickBtn.classList.add('theia-mini-browser-workbench-button', ...codiconArray('inspect'));
    disposables.push(addEventListener(pickBtn, 'click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        pickHandler();
    }));
    workbench.append(pickBtn);

    const inspectorBtn = document.createElement('button');
    inspectorBtn.type = 'button';
    inspectorBtn.title = nls.localize('theia/mini-browser/toggleElementInspector', 'Toggle Element Inspector');
    inspectorBtn.classList.add('theia-mini-browser-workbench-button', ...codiconArray('layout-panel'));
    inlineInspector?.bindToggleButton(inspectorBtn);
    disposables.push(addEventListener(inspectorBtn, 'click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        inspectorHandler();
    }));
    workbench.append(inspectorBtn);

    toolbar.append(urlField, workbench);

    root.append(toolbar, body);

    let currentUrl = normalizePreviewNavigateUrl(options.url);

    const adapter: QaapAgentPreviewChromeHost = {
        getRoot: () => root,
        getFrame: () => frame,
        getCurrentUrl: () => currentUrl,
        getPageTitle: () => {
            try {
                return frame.contentDocument?.title || undefined;
            } catch {
                return undefined;
            }
        },
        navigate: (url, navOptions) => {
            const next = normalizePreviewNavigateUrl(url);
            currentUrl = next;
            urlInput.value = next;
            if (navOptions?.hard) {
                const bust = next.includes('?') ? `${next}&_qaap_cache_bust=${Date.now()}` : `${next}?_qaap_cache_bust=${Date.now()}`;
                frame.src = bust;
            } else {
                frame.src = next;
            }
            options.onNavigate?.(next);
        },
        reload: () => {
            try {
                frame.contentWindow?.location.reload();
            } catch {
                frame.src = currentUrl;
            }
        },
        hardReload: () => {
            const url = currentUrl.trim();
            if (!url) {
                previewNotify(
                    { messageService: options.messageService, notify: options.notify },
                    nls.localize('qaap/preview/noUrlToReload', 'No URL loaded'),
                    'warn',
                );
                return;
            }
            const bust = url.includes('?')
                ? `${url}&_qaap_cache_bust=${Date.now()}`
                : `${url}?_qaap_cache_bust=${Date.now()}`;
            try {
                frame.contentWindow?.location.replace(bust);
            } catch {
                frame.src = bust;
            }
        },
        openExternal: () => {
            const target = currentUrl;
            if (options.openExternal) {
                options.openExternal(target);
            } else {
                window.open(target, '_blank', 'noopener,noreferrer');
            }
        },
        copyCurrentUrl: async () => {
            if (options.clipboard) {
                await options.clipboard.writeText(currentUrl);
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(currentUrl);
            }
            options.messageService?.info(nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
        },
        onPickElement: pickHandler,
        onToggleInspector: inspectorHandler,
        setInspectorPosition: position => setPreviewInspectorPosition(split, inspectorSlot, position),
    };

    const controller = new QaapAgentPreviewChromeController(adapter, {
        clipboard: options.clipboard,
        messageService: options.messageService,
        notify: options.notify,
        embedded: true,
    });
    controller.attachToolbarControls(toolbar, refreshBtn);
    disposables.push(controller);

    disposables.push(addEventListener(refreshBtn, 'click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        adapter.reload();
    }));
    disposables.push(addEventListener(openBtn, 'click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        adapter.openExternal();
    }));
    disposables.push(addEventListener(goBtn, 'click', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        void adapter.navigate(urlInput.value);
    }));
    disposables.push(addEventListener(urlInput, 'keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            void adapter.navigate(urlInput.value);
        }
    }));
    disposables.push(addEventListener(frame, 'load', () => {
        try {
            const href = frame.contentWindow?.location.href;
            if (href && href !== 'about:blank') {
                currentUrl = href;
                urlInput.value = href;
            }
        } catch {
            /* cross-origin */
        }
        surfaceHandle?.picker.onFrameLoad();
        controller.recordVisit();
    }));

    const api: EmbeddedAgentPreviewChrome = {
        root,
        frame,
        controller,
        setUrl: (url: string) => {
            void adapter.navigate(url);
        },
        navigate: (url: string) => adapter.navigate(url),
        reload: () => adapter.reload(),
        dispose: () => {
            disposables.dispose();
            host.replaceChildren();
        },
    };

    api.setUrl(options.url);
    return api;
}

function normalizePreviewNavigateUrl(url: string): string {
    const opened = normalizeMiniBrowserOpenUrl(url) || url;
    return normalizePreviewUrlForSameOrigin(opened);
}

export function attachAgentPreviewChromeToMiniBrowserContent(
    content: {
        readonly node: HTMLElement;
        readonly frame: HTMLIFrameElement;
        readonly input: HTMLInputElement;
        go(location: string, options?: { preserveFocus?: boolean; showLoadIndicator?: boolean }): Promise<void>;
        handleRefresh(): void;
        handleOpen(): void;
        frameSrc(): string | undefined;
        startElementPicker(): void;
        commands?: { executeCommand(id: string): Promise<unknown>; isEnabled(id: string): boolean };
    },
    deps: {
        clipboard: ClipboardService;
        messageService: MessageService;
        inspectorToggleCommandId?: string;
    },
): QaapAgentPreviewChromeController {
    const host: QaapAgentPreviewChromeHost = {
        getRoot: () => content.node,
        getFrame: () => content.frame,
        getCurrentUrl: () => content.frameSrc() || content.input.value || '',
        getPageTitle: () => {
            try {
                return content.frame.contentDocument?.title || undefined;
            } catch {
                return undefined;
            }
        },
        navigate: (url, options) => {
            const normalized = normalizeMiniBrowserOpenUrl(url) || url;
            if (options?.hard) {
                const bust = normalized.includes('?')
                    ? `${normalized}&_qaap_cache_bust=${Date.now()}`
                    : `${normalized}?_qaap_cache_bust=${Date.now()}`;
                return content.go(bust, { preserveFocus: false });
            }
            return content.go(normalized, { preserveFocus: false });
        },
        reload: () => content.handleRefresh(),
        hardReload: () => {
            const current = content.frameSrc() || content.input.value;
            if (current) {
                void host.navigate(current, { hard: true });
            } else {
                content.handleRefresh();
            }
        },
        openExternal: () => content.handleOpen(),
        copyCurrentUrl: async () => {
            const url = host.getCurrentUrl();
            if (url) {
                await deps.clipboard.writeText(url);
                deps.messageService.info(nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
            }
        },
        onPickElement: () => content.startElementPicker(),
        onToggleInspector: deps.inspectorToggleCommandId && content.commands
            ? () => {
                const id = deps.inspectorToggleCommandId!;
                if (content.commands!.isEnabled(id)) {
                    void content.commands!.executeCommand(id).catch(() => undefined);
                }
            }
            : undefined,
    };
    const controller = new QaapAgentPreviewChromeController(host, {
        clipboard: deps.clipboard,
        messageService: deps.messageService,
    });
    const toolbar = content.node.querySelector('.theia-mini-browser-toolbar, .theia-mini-browser-toolbar-read-only');
    if (toolbar instanceof HTMLElement) {
        const firstNav = toolbar.querySelector('.theia-mini-browser-previous');
        controller.attachToolbarControls(toolbar, firstNav instanceof HTMLElement ? firstNav : undefined);
    }
    return controller;
}
