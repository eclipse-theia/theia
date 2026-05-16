// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable } from '@theia/core/lib/common/disposable';
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
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import {
    ELEMENT_PICKER_MESSAGE_TYPE,
    ELEMENT_PICKER_CANCEL_TYPE,
    ELEMENT_REFRESH_RESPONSE_TYPE,
    PickedElement
} from '@theia/qaap-element-inspector/lib/browser/element-inspector-types';
import { buildElementBridgeScript, buildElementPickerScript } from '@theia/qaap-element-inspector/lib/browser/element-picker-script';
import { ELEMENT_INSPECTOR_REVEAL_COMMAND_ID, ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID } from '@theia/qaap-element-inspector/lib/browser/element-inspector-contribution';
import { QaapMiniBrowserContentStyle } from './qaap-mini-browser-content-style';
/**
 * Qaap mini-browser preview: element inspector, workbench toolbar, read-only URL editing.
 */
@injectable()
export class QaapMiniBrowserContent extends MiniBrowserContent {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ElementInspectorService)
    protected readonly inspectorService: ElementInspectorService;

    protected pickerListenerInstalled = false;

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
        const { startPage } = this.props;
        if (startPage) {
            void this.listenOnContentChange(startPage);
            void this.go(startPage.trim());
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        const { startPage } = this.props;
        if (!startPage) {
            return;
        }
        const url = startPage.trim();
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

    protected override createToolbar(parent: HTMLElement): HTMLDivElement & Readonly<{ input: HTMLInputElement }> {
        const toolbar = document.createElement('div');
        toolbar.classList.add(this.getToolbarProps() === 'read-only' ? MiniBrowserContentStyle.TOOLBAR_READ_ONLY : MiniBrowserContentStyle.TOOLBAR);
        parent.appendChild(toolbar);
        this.createPrevious(toolbar);
        this.createNext(toolbar);
        this.createRefresh(toolbar);
        const input = this.createInput(toolbar);
        this.createWorkbenchControls(toolbar);
        if (this.getToolbarProps() === 'hide') {
            toolbar.style.display = 'none';
        }
        return Object.assign(toolbar, { input });
    }

    protected override onFrameLoad(): void {
        super.onFrameLoad();
        this.injectInspectorBridge();
    }

    protected override handleOpen(): void {
        const location = this.frameSrc() || this.input.value;
        if (location) {
            this.windowService.openNewWindow(location, { external: true });
        }
    }

    protected injectInspectorBridge(): void {
        try {
            const doc = this.frame?.contentDocument;
            if (!doc) {
                return;
            }
            const script = doc.createElement('script');
            script.textContent = buildElementBridgeScript();
            doc.documentElement.appendChild(script);
            script.remove();
        } catch {
            // cross-origin iframe — silently skip; the picker will warn at use time.
        }
    }

    protected createWorkbenchControls(parent: HTMLElement): HTMLElement {
        const controls = document.createElement('div');
        controls.classList.add(QaapMiniBrowserContentStyle.WORKBENCH_CONTROLS);
        parent.appendChild(controls);
        this.createOpen(controls);
        this.createInspectButton(controls);
        this.createCommandButton(
            controls,
            ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID,
            nls.localize('theia/mini-browser/toggleElementInspector', 'Toggle Element Inspector'),
            'layout-panel'
        );
        return controls;
    }

    protected createInspectButton(parent: HTMLElement): HTMLElement {
        const button = this.createWorkbenchButton(
            parent,
            nls.localize('theia/mini-browser/pickElement', 'Pick an element to send to chat'),
            'inspect'
        );
        this.toDispose.push(addEventListener(button, 'click', () => this.handleInspect()));
        return button;
    }

    protected handleInspect(): void {
        this.installPickerListener();
        try {
            const doc = this.frame?.contentDocument;
            const win = this.frame?.contentWindow;
            if (!doc || !win) {
                this.notifyPickerUnavailable();
                return;
            }
            this.injectInspectorBridge();
            const script = doc.createElement('script');
            script.textContent = buildElementPickerScript();
            doc.documentElement.appendChild(script);
            script.remove();
        } catch {
            this.notifyPickerUnavailable();
        }
    }

    protected notifyPickerUnavailable(): void {
        this.messageService.warn(nls.localize(
            'theia/mini-browser/pickerUnavailable',
            'The element picker cannot run on this page because the preview is cross-origin. Open a same-origin preview to use it.'
        ));
    }

    protected installPickerListener(): void {
        if (this.pickerListenerInstalled) {
            return;
        }
        this.pickerListenerInstalled = true;
        const handler = (event: MessageEvent): void => {
            if (!event.data || typeof event.data !== 'object') {
                return;
            }
            if (this.frame && event.source && event.source !== this.frame.contentWindow) {
                return;
            }
            const data = event.data as { type?: string; payload?: PickedElement; error?: string };
            if (data.type === ELEMENT_PICKER_MESSAGE_TYPE && data.payload) {
                void this.handlePickedElement(data.payload);
            } else if (data.type === ELEMENT_REFRESH_RESPONSE_TYPE && data.payload) {
                this.inspectorService.refreshed(data.payload);
            } else if (data.type === ELEMENT_PICKER_CANCEL_TYPE) {
                // no-op: the in-frame script tears itself down
            }
        };
        window.addEventListener('message', handler);
        this.toDispose.push(Disposable.create(() => window.removeEventListener('message', handler)));
    }

    protected async handlePickedElement(element: PickedElement): Promise<void> {
        this.inspectorService.bind(this.frame?.contentWindow ?? undefined);
        this.inspectorService.pick(element);
        const summary = this.formatElementForChat(element);
        try {
            await this.clipboard.writeText(summary);
        } catch {
            // clipboard may be denied in some sandboxes; the inspector panel still has the data
        }
        await this.revealInspector();
        this.messageService.info(nls.localize(
            'theia/mini-browser/elementCaptured',
            'Captured {0}. Details opened in the Element Inspector and copied to the clipboard.',
            element.tagName + (element.id ? '#' + element.id : '') + (element.classes.length ? '.' + element.classes.slice(0, 2).join('.') : '')
        ));
    }

    protected async revealInspector(): Promise<void> {
        if (!this.commands.getCommand(ELEMENT_INSPECTOR_REVEAL_COMMAND_ID)) {
            return;
        }
        try {
            await this.commands.executeCommand(ELEMENT_INSPECTOR_REVEAL_COMMAND_ID);
        } catch {
            // inspector contribution might not be available; ignore
        }
    }

    protected formatElementForChat(element: PickedElement): string {
        const lines: string[] = [];
        lines.push('Selected DOM element from preview ' + element.pageUrl);
        lines.push('DOM Path: ' + element.domPath);
        const { top, left, width, height } = element.position;
        lines.push(`Position: top=${top}px, left=${left}px, width=${width}px, height=${height}px`);
        lines.push('HTML Element: ' + element.outerHTML);
        if (element.textPreview) {
            lines.push('Text: ' + element.textPreview);
        }
        return lines.join('\n');
    }

    protected createCommandButton(parent: HTMLElement, commandId: string, title: string, icon: string): HTMLElement {
        const button = this.createWorkbenchButton(parent, title, icon);
        this.toDispose.push(addEventListener(button, 'click', () => {
            if (this.commands.isEnabled(commandId)) {
                void this.commands.executeCommand(commandId).catch(() => undefined);
            }
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
        this.toDispose.push(addEventListener(button, 'click', () => this.openEmitter.fire(undefined)));
        return button;
    }
}
