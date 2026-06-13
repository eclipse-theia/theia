// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import URI from '@theia/core/lib/common/uri';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { FileChangeType, FileChangesEvent } from '@theia/filesystem/lib/common/files';
import debounce = require('@theia/core/shared/lodash.debounce');
import { addEventListener, codiconArray } from '@theia/core/lib/browser/widgets/widget';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { MiniBrowserContent } from '@theia/mini-browser/lib/browser/mini-browser-content';
import { MiniBrowserContentStyle } from '@theia/mini-browser/lib/browser/mini-browser-content-style';
import { QaapMiniBrowserContentStyle } from './qaap-mini-browser-content-style';
import { isMiniBrowserPreviewPlaceholderUrl, QAAP_DEFAULT_PREVIEW_INPUT_URL } from './qaap-mini-browser-defaults';
import {
    QaapAgentPreviewChromeController,
    createQaapPreviewToolbarIconButton,
    type QaapAgentPreviewChromeHost,
} from './qaap-agent-preview-chrome';
import { QaapAgentPreviewChromeStyle } from './qaap-agent-preview-chrome-style';
import {
    QaapPreviewSurfaceHandle,
    QaapPreviewSurfaceRegistry,
} from './qaap-preview-surface-registry';
import { QaapPreviewFramePicker, QaapPreviewFramePickerFactory } from './qaap-preview-frame-picker';
import {
    QaapPreviewInlineInspector,
    setPreviewInspectorPosition,
    wirePreviewInspectorResize,
} from './qaap-preview-inline-inspector';
import { normalizePreviewUrlForSameOrigin } from './qaap-preview-url-utils';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
/**
 * Qaap mini-browser preview: element inspector, workbench toolbar, read-only URL editing.
 */
@injectable()
export class QaapMiniBrowserContent extends MiniBrowserContent {

    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(QaapPreviewSurfaceRegistry)
    protected readonly previewSurfaces: QaapPreviewSurfaceRegistry;

    @inject(QaapPreviewFramePickerFactory)
    protected readonly pickerFactory: QaapPreviewFramePickerFactory;

    @inject(ElementInspectorService)
    protected readonly elementInspectorService: ElementInspectorService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    protected previewChrome: QaapAgentPreviewChromeController | undefined;

    protected surfaceHandle: QaapPreviewSurfaceHandle | undefined;

    protected framePicker: QaapPreviewFramePicker | undefined;

    protected inlineInspector: QaapPreviewInlineInspector | undefined;

    protected inspectorToggleButton: HTMLButtonElement | undefined;

    protected suspendedPreviewUrl: string | undefined;

    protected previewFrameSuspended = false;

    get previewFrame(): HTMLIFrameElement {
        return this.frame;
    }

    getPreviewFramePicker(): QaapPreviewFramePicker {
        return this.ensureFramePicker();
    }

    @postConstruct()
    protected override init(): void {
        this.toDispose.push(this.mouseTracker.onMousedown(() => {
            if (this.frame.style.display !== 'none') {
                this.transparentOverlay.style.display = 'block';
            }
        }));
        this.toDispose.push(this.mouseTracker.onMouseup(() => {
            if (this.frame.style.display !== 'none') {
                this.transparentOverlay.style.display = 'none';
            }
        }));
        const startPage = this.effectiveStartPage();
        if (startPage) {
            void this.listenOnContentChange(startPage);
            void this.go(startPage);
        } else {
            this.setInput(QAAP_DEFAULT_PREVIEW_INPUT_URL);
        }
        this.ensureFramePicker();
    }

    protected ensureFramePicker(): QaapPreviewFramePicker {
        if (!this.framePicker) {
            this.framePicker = this.pickerFactory.create(this.frame, this.toDispose);
            if (this.inlineInspector) {
                this.framePicker.connectInlineInspector(this.inlineInspector);
            }
        }
        return this.framePicker;
    }

    protected ensureInlineInspector(inspectorSlot: HTMLElement): void {
        if (this.inlineInspector) {
            return;
        }
        this.inlineInspector = new QaapPreviewInlineInspector(inspectorSlot, {
            service: this.elementInspectorService,
            commands: this.commandRegistry,
            messageService: this.messageService,
            toDispose: this.toDispose,
        });
        if (this.inspectorToggleButton) {
            this.inlineInspector.bindToggleButton(this.inspectorToggleButton);
        }
        this.ensureFramePicker().connectInlineInspector(this.inlineInspector);
    }

    protected override createContentArea(parent: HTMLElement): HTMLElement & Readonly<{
        frame: HTMLIFrameElement;
        loadIndicator: HTMLElement;
        errorBar: HTMLElement & Readonly<{ message: HTMLElement }>;
        pdfContainer: HTMLElement;
        transparentOverlay: HTMLElement;
    }> {
        const contentArea = super.createContentArea(parent);
        contentArea.classList.add('qaap-preview-content-area');
        // Use contentArea refs — constructor assigns `this.frame` only after createContentArea returns.
        const frame = contentArea.frame;
        const transparentOverlay = contentArea.transparentOverlay;

        const split = document.createElement('div');
        split.className = 'qaap-preview-split';

        const frameSlot = document.createElement('div');
        frameSlot.className = 'qaap-preview-frame-slot';

        const inspectorSlot = document.createElement('aside');
        inspectorSlot.className = 'qaap-preview-inspector-slot';

        contentArea.insertBefore(split, frame);
        frameSlot.append(frame);
        if (transparentOverlay.parentElement === contentArea) {
            frameSlot.append(transparentOverlay);
        }
        const loadIndicator = contentArea.querySelector(`.${MiniBrowserContentStyle.PRE_LOAD}`);
        if (loadIndicator instanceof HTMLElement && loadIndicator.parentElement === contentArea) {
            frameSlot.insertBefore(loadIndicator, frame);
        }
        split.append(frameSlot, inspectorSlot);
        wirePreviewInspectorResize(split, inspectorSlot, this.toDispose);
        return contentArea;
    }

    protected override go(location: string, options?: Parameters<MiniBrowserContent['go']>[1]): Promise<void> {
        const normalized = normalizePreviewUrlForSameOrigin(location);
        this.previewFrameSuspended = false;
        const result = super.go(normalized, options);
        this.previewChrome?.recordNavigationIntent(location);
        return result;
    }

    /** Unloads the iframe (about:blank) while keeping the URL for {@link resumePreviewFrame}. */
    suspendPreviewFrame(): void {
        if (this.previewFrameSuspended) {
            return;
        }
        const current = this.frameSrc() || this.input.value.trim();
        if (current) {
            this.suspendedPreviewUrl = normalizePreviewUrlForSameOrigin(current);
        }
        this.previewFrameSuspended = true;
        this.frame.src = 'about:blank';
    }

    /** Restores a URL previously suspended via {@link suspendPreviewFrame}. */
    resumePreviewFrame(): void {
        if (!this.previewFrameSuspended) {
            return;
        }
        this.previewFrameSuspended = false;
        const url = this.suspendedPreviewUrl ?? this.effectiveStartPage();
        this.suspendedPreviewUrl = undefined;
        if (url) {
            void this.go(url, { showLoadIndicator: true, preserveFocus: false });
        }
    }

    protected override onBeforeShow(msg: Message): void {
        super.onBeforeShow(msg);
        this.resumePreviewFrame();
    }

    protected override onAfterHide(msg: Message): void {
        super.onAfterHide(msg);
        this.suspendPreviewFrame();
    }

    protected effectiveStartPage(): string | undefined {
        const raw = this.props.startPage?.trim();
        if (!raw || isMiniBrowserPreviewPlaceholderUrl(raw)) {
            return undefined;
        }
        return raw;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        const inspectorSlot = this.node.querySelector('.qaap-preview-inspector-slot');
        if (inspectorSlot instanceof HTMLElement) {
            this.ensureInlineInspector(inspectorSlot);
            if (this.framePicker && this.inlineInspector) {
                this.framePicker.connectInlineInspector(this.inlineInspector);
            }
        }
        if (!this.surfaceHandle) {
            this.surfaceHandle = this.previewSurfaces.registerMiniBrowserContent(this, this.toDispose);
        }
        const url = this.effectiveStartPage();
        if (!url) {
            return;
        }
        queueMicrotask(() => {
            const src = this.frame.src || '';
            const blankish = !src || src === 'about:blank';
            if (blankish) {
                void this.go(url);
            }
        });
    }

    protected override async listenOnContentChange(location: string): Promise<void> {
        try {
            if (await this.fileService.exists(new URI(location))) {
                const fileUri = new URI(location);
                const watcher = this.fileService.watch(fileUri);
                this.toDispose.push(watcher);
                const onFileChange = (event: FileChangesEvent) => {
                    if (event.contains(fileUri, FileChangeType.ADDED) || event.contains(fileUri, FileChangeType.UPDATED)) {
                        this.go(location, {
                            showLoadIndicator: false
                        });
                    }
                };
                this.toDispose.push(this.fileService.onDidFilesChange(debounce(onFileChange, 500)));
            }
        } catch {
            /* not a workspace file URL — skip watching */
        }
    }

    protected override createInput(parent: HTMLElement): HTMLInputElement {
        const field = document.createElement('div');
        field.classList.add(QaapMiniBrowserContentStyle.URL_FIELD);
        parent.appendChild(field);
        const input = super.createInput(field);
        if (this.getToolbarProps() === 'show') {
            const goButton = document.createElement('button');
            goButton.type = 'button';
            goButton.classList.add(QaapMiniBrowserContentStyle.GO_BUTTON);
            goButton.textContent = nls.localize('theia/mini-browser/go', 'Go');
            goButton.title = nls.localize('theia/mini-browser/goToUrl', 'Go to URL');
            this.toDispose.push(addEventListener(goButton, 'click', () => this.navigateFromUrlBar()));
            field.appendChild(goButton);
        }
        return input;
    }

    protected override onUrlBarNavigateFailed(message: string): void {
        super.onUrlBarNavigateFailed(message);
        this.messageService.warn(message);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (typeof window === 'undefined') {
            return;
        }
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            if (this.isDisposed || !this.isAttached) {
                return;
            }
            if (this.getToolbarProps() !== 'hide' && this.input?.isConnected) {
                this.input.focus();
                return;
            }
            if (!this.node.hasAttribute('tabindex')) {
                this.node.setAttribute('tabindex', '-1');
            }
            this.node.focus();
        }));
    }

    protected override createRefresh(parent: HTMLElement): HTMLElement {
        const button = createQaapPreviewToolbarIconButton(
            nls.localize('theia/mini-browser/reload', 'Reload'),
            'refresh',
            QaapAgentPreviewChromeStyle.TOOLBAR_REFRESH,
        );
        parent.appendChild(button);
        return this.onClick(button, this.refreshEmitter);
    }

    protected override createToolbar(parent: HTMLElement): HTMLDivElement & Readonly<{ input: HTMLInputElement }> {
        const toolbar = document.createElement('div');
        toolbar.classList.add(this.getToolbarProps() === 'read-only' ? MiniBrowserContentStyle.TOOLBAR_READ_ONLY : MiniBrowserContentStyle.TOOLBAR);
        parent.appendChild(toolbar);
        this.createPrevious(toolbar);
        this.createNext(toolbar);
        this.createRefresh(toolbar);
        const input = this.createInput(toolbar);
        this.createWorkbenchControls(toolbar);
        if (this.getToolbarProps() !== 'hide') {
            this.ensurePreviewChrome(toolbar);
        }
        if (this.getToolbarProps() === 'hide') {
            toolbar.style.display = 'none';
        }
        return Object.assign(toolbar, { input });
    }

    protected ensurePreviewChrome(toolbar: HTMLElement): void {
        if (this.previewChrome) {
            return;
        }
        const host = this.createPreviewChromeHost();
        this.previewChrome = new QaapAgentPreviewChromeController(host, {
            clipboard: this.clipboard,
            messageService: this.messageService,
        });
        const firstNav = toolbar.querySelector('.theia-mini-browser-previous');
        this.previewChrome.attachToolbarControls(
            toolbar,
            firstNav instanceof HTMLElement ? firstNav : undefined,
        );
        this.toDispose.push(this.previewChrome);
    }

    protected createPreviewChromeHost(): QaapAgentPreviewChromeHost {
        return {
            getRoot: () => this.node,
            getFrame: () => this.frame,
            getCurrentUrl: () => this.frameSrc() || this.input.value || '',
            getPageTitle: () => {
                try {
                    return this.frame.contentDocument?.title || undefined;
                } catch {
                    return undefined;
                }
            },
            navigate: (url, options) => {
                const normalized = url.trim();
                if (options?.hard) {
                    const bust = normalized.includes('?')
                        ? `${normalized}&_qaap_cache_bust=${Date.now()}`
                        : `${normalized}?_qaap_cache_bust=${Date.now()}`;
                    return this.go(bust, { preserveFocus: false });
                }
                return this.go(normalized, { preserveFocus: false });
            },
            reload: () => this.handleRefresh(),
            hardReload: () => {
                const current = this.frameSrc() || this.input.value;
                if (current) {
                    void this.go(
                        current.includes('?')
                            ? `${current}&_qaap_cache_bust=${Date.now()}`
                            : `${current}?_qaap_cache_bust=${Date.now()}`,
                        { preserveFocus: false },
                    );
                } else {
                    this.handleRefresh();
                }
            },
            openExternal: () => this.handleOpen(),
            copyCurrentUrl: async () => {
                const url = this.frameSrc() || this.input.value;
                if (url) {
                    await this.clipboard.writeText(url);
                    this.messageService.info(nls.localize('qaap/preview/urlCopied', 'URL copied to clipboard'));
                }
            },
            onPickElement: () => this.startElementPicker(),
            onToggleInspector: () => { void this.openElementInspector(); },
            setInspectorPosition: position => {
                const split = this.node.querySelector('.qaap-preview-split');
                const inspectorSlot = this.node.querySelector('.qaap-preview-inspector-slot');
                if (split instanceof HTMLElement && inspectorSlot instanceof HTMLElement) {
                    setPreviewInspectorPosition(split, inspectorSlot, position);
                }
            },
        };
    }

    protected override onFrameLoad(): void {
        super.onFrameLoad();
        this.ensureFramePicker().onFrameLoad();
        if (this.frameSrc()) {
            this.previewChrome?.recordVisit();
        }
    }

    /** Starts the in-iframe DOM picker (toolbar, command, AI tool). */
    startElementPicker(): void {
        this.ensureFramePicker().startElementPicker();
    }

    openElementInspector(): Promise<void> {
        return this.ensureFramePicker().openElementInspector();
    }

    /** @deprecated Use {@link openElementInspector}. */
    toggleElementInspector(): Promise<void> {
        return this.openElementInspector();
    }

    protected override handleOpen(): void {
        const location = this.frameSrc() || this.input.value;
        if (location) {
            this.windowService.openNewWindow(location, { external: true });
        }
    }

    protected createWorkbenchControls(parent: HTMLElement): HTMLElement {
        const controls = document.createElement('div');
        controls.classList.add(QaapMiniBrowserContentStyle.WORKBENCH_CONTROLS);
        parent.appendChild(controls);
        this.createOpen(controls);
        this.createInspectButton(controls);
        this.createInspectorToggleButton(controls);
        return controls;
    }

    protected createInspectButton(parent: HTMLElement): HTMLElement {
        const button = this.createWorkbenchButton(
            parent,
            nls.localize('theia/mini-browser/pickElement', 'Pick an element to send to chat'),
            'inspect'
        );
        this.toDispose.push(addEventListener(button, 'click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.startElementPicker();
        }));
        return button;
    }

    protected createInspectorToggleButton(parent: HTMLElement): HTMLElement {
        const button = this.createWorkbenchButton(
            parent,
            nls.localize('theia/mini-browser/toggleElementInspector', 'Toggle Element Inspector'),
            'layout-panel'
        ) as HTMLButtonElement;
        this.inspectorToggleButton = button;
        this.inlineInspector?.bindToggleButton(button);
        this.toDispose.push(addEventListener(button, 'click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            void this.openElementInspector();
        }));
        return button;
    }

    protected createWorkbenchButton(parent: HTMLElement, title: string, icon: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = title;
        button.classList.add(QaapMiniBrowserContentStyle.WORKBENCH_BUTTON, ...codiconArray(icon));
        parent.appendChild(button);
        return button;
    }

    protected override createOpen(parent: HTMLElement): HTMLElement {
        const button = this.createWorkbenchButton(
            parent,
            nls.localize('theia/mini-browser/openInNewBrowserTab', 'Open in New Browser Tab'),
            'link-external'
        );
        button.classList.add(QaapMiniBrowserContentStyle.OPEN);
        this.toDispose.push(addEventListener(button, 'click', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.openEmitter.fire(undefined);
        }));
        return button;
    }
}
