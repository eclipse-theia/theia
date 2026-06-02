// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import {
    ELEMENT_PICKER_CANCEL_TYPE,
    ELEMENT_PICKER_MESSAGE_TYPE,
    ELEMENT_REFRESH_RESPONSE_TYPE,
    PickedElement,
} from '@theia/qaap-element-inspector/lib/browser/element-inspector-types';
import { buildElementBridgeScript, buildElementPickerScript } from '@theia/qaap-element-inspector/lib/browser/element-picker-script';
import {
    ELEMENT_INSPECTOR_REVEAL_COMMAND_ID,
    ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID,
} from '@theia/qaap-element-inspector/lib/browser/element-inspector-contribution';

/** DOM picker + inspector bridge for a single preview iframe (mini-browser or embedded). */
@injectable()
export class QaapPreviewFramePickerFactory {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ElementInspectorService)
    protected readonly inspectorService: ElementInspectorService;

    create(frame: HTMLIFrameElement, toDispose: DisposableCollection): QaapPreviewFramePicker {
        return new QaapPreviewFramePicker(
            frame,
            this.commands,
            this.clipboard,
            this.messageService,
            this.inspectorService,
            toDispose,
        );
    }
}

export class QaapPreviewFramePicker {

    protected pickerListenerInstalled = false;

    constructor(
        protected readonly frame: HTMLIFrameElement,
        protected readonly commands: CommandRegistry,
        protected readonly clipboard: ClipboardService,
        protected readonly messageService: MessageService,
        protected readonly inspectorService: ElementInspectorService,
        protected readonly toDispose: DisposableCollection,
    ) {
        toDispose.push(Disposable.create(() => {
            this.pickerListenerInstalled = false;
        }));
    }

    bindInspectorWindow(): void {
        try {
            const win = this.frame.contentWindow;
            if (win) {
                this.inspectorService.bind(win);
            }
        } catch {
            /* cross-origin */
        }
    }

    injectInspectorBridge(): void {
        try {
            const doc = this.frame.contentDocument;
            if (!doc) {
                return;
            }
            const script = doc.createElement('script');
            script.textContent = buildElementBridgeScript();
            doc.documentElement.appendChild(script);
            script.remove();
        } catch {
            /* cross-origin */
        }
    }

    onFrameLoad(): void {
        this.injectInspectorBridge();
        this.bindInspectorWindow();
    }

    startElementPicker(): void {
        this.installPickerListener();
        try {
            const doc = this.frame.contentDocument;
            const win = this.frame.contentWindow;
            if (!doc || !win) {
                this.notifyPickerUnavailable();
                return;
            }
            this.injectInspectorBridge();
            const script = doc.createElement('script');
            script.textContent = buildElementPickerScript();
            doc.documentElement.appendChild(script);
            script.remove();
            this.messageService.info(nls.localize(
                'qaap/preview/pickerActive',
                'Element picker active — click an element in the preview.',
            ));
        } catch {
            this.notifyPickerUnavailable();
        }
    }

    async toggleElementInspector(): Promise<void> {
        this.bindInspectorWindow();
        const toggleId = ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID;
        const revealId = ELEMENT_INSPECTOR_REVEAL_COMMAND_ID;
        if (this.commands.getCommand(toggleId)) {
            try {
                await this.commands.executeCommand(toggleId);
                return;
            } catch {
                /* try reveal */
            }
        }
        if (this.commands.getCommand(revealId)) {
            try {
                await this.commands.executeCommand(revealId);
                return;
            } catch {
                /* unavailable */
            }
        }
        this.messageService.warn(nls.localize(
            'qaap/preview/inspectorUnavailable',
            'Element Inspector is not available. Open a same-origin preview and try again.',
        ));
    }

    protected notifyPickerUnavailable(): void {
        this.messageService.warn(nls.localize(
            'theia/mini-browser/pickerUnavailable',
            'The element picker cannot run on this page because the preview is cross-origin. Open a same-origin preview to use it.',
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
            if (this.frame.contentWindow && event.source && event.source !== this.frame.contentWindow) {
                return;
            }
            const data = event.data as { type?: string; payload?: PickedElement };
            if (data.type === ELEMENT_PICKER_MESSAGE_TYPE && data.payload) {
                void this.handlePickedElement(data.payload);
            } else if (data.type === ELEMENT_REFRESH_RESPONSE_TYPE && data.payload) {
                this.inspectorService.refreshed(data.payload);
            } else if (data.type === ELEMENT_PICKER_CANCEL_TYPE) {
                // in-frame script cleans up
            }
        };
        window.addEventListener('message', handler);
        this.toDispose.push(Disposable.create(() => window.removeEventListener('message', handler)));
    }

    protected async handlePickedElement(element: PickedElement): Promise<void> {
        this.inspectorService.bind(this.frame.contentWindow ?? undefined);
        this.inspectorService.pick(element);
        const summary = this.formatElementForChat(element);
        try {
            await this.clipboard.writeText(summary);
        } catch {
            /* clipboard denied */
        }
        await this.revealInspector();
        this.messageService.info(nls.localize(
            'theia/mini-browser/elementCaptured',
            'Captured {0}. Details opened in the Element Inspector and copied to the clipboard.',
            element.tagName + (element.id ? '#' + element.id : '') + (element.classes.length ? '.' + element.classes.slice(0, 2).join('.') : ''),
        ));
    }

    protected async revealInspector(): Promise<void> {
        if (!this.commands.getCommand(ELEMENT_INSPECTOR_REVEAL_COMMAND_ID)) {
            return;
        }
        try {
            await this.commands.executeCommand(ELEMENT_INSPECTOR_REVEAL_COMMAND_ID);
        } catch {
            /* ignore */
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
}
