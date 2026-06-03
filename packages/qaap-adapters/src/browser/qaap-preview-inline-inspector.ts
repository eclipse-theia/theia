// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import {
    mountEmbeddedElementInspector,
    type EmbeddedElementInspectorHost,
} from '@theia/qaap-element-inspector/lib/browser/element-inspector-panel-mount';
import {
    applyPreviewInspectorPanelSize,
    type QaapPreviewInspectorPosition,
    writePreviewInspectorPosition,
} from './qaap-preview-inspector-panel-size';
import {
    QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE,
    QAAP_PREVIEW_INSPECTOR_RESIZING,
    syncPreviewInspectorResizeHandleOrientation,
    wirePreviewInspectorResize,
} from './qaap-preview-inspector-resize-wiring';

export {
    QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE,
    QAAP_PREVIEW_INSPECTOR_RESIZING,
    wirePreviewInspectorResize,
};
export { applyPreviewInspectorPanelSize };

export interface QaapPreviewInspectorDeps {
    readonly service: ElementInspectorService;
    readonly commands: CommandRegistry;
}

export interface QaapPreviewInlineInspectorOptions {
    readonly service: ElementInspectorService;
    readonly commands: CommandRegistry;
    readonly messageService?: MessageService;
    readonly toDispose: DisposableCollection;
}

/** Inline Element Inspector rail (Design / CSS / HTML) beside the preview iframe. */
export class QaapPreviewInlineInspector {

    protected host: EmbeddedElementInspectorHost | undefined;
    protected toggleButton: HTMLButtonElement | undefined;

    constructor(
        protected readonly container: HTMLElement,
        protected readonly options: QaapPreviewInlineInspectorOptions,
    ) {
        this.host = mountEmbeddedElementInspector(
            container,
            options.service,
            options.commands,
            options.toDispose,
        );
    }

    bindToggleButton(button: HTMLButtonElement): void {
        this.toggleButton = button;
        this.host?.syncButtonState(button);
    }

    open(): void {
        const split = this.container.closest('.qaap-preview-split');
        if (split instanceof HTMLElement) {
            applyPreviewInspectorPanelSize(this.container, split);
        }
        this.host?.show();
        this.host?.syncButtonState(this.toggleButton);
    }

    close(): void {
        this.host?.hide();
        this.host?.syncButtonState(this.toggleButton);
    }

    toggle(): void {
        if (!this.host) {
            return;
        }
        this.host.toggle();
        if (this.host.isOpen() && !this.options.service.state.picked) {
            this.options.messageService?.info(nls.localize(
                'qaap/preview/inspectorPickHint',
                'Use the element picker ({0}) in the preview toolbar, then edit styles here.',
                'inspect',
            ));
        }
    }

    isOpen(): boolean {
        return this.host?.isOpen() ?? false;
    }
}

export function createPreviewSplitLayout(frameHost: HTMLElement): {
    split: HTMLElement;
    frameSlot: HTMLElement;
    inspectorSlot: HTMLElement;
} {
    const split = document.createElement('div');
    split.className = 'qaap-preview-split';

    const frameSlot = document.createElement('div');
    frameSlot.className = 'qaap-preview-frame-slot';

    const inspectorSlot = document.createElement('aside');
    inspectorSlot.className = 'qaap-preview-inspector-slot';
    inspectorSlot.hidden = true;

    frameHost.parentElement?.insertBefore(split, frameHost);
    frameSlot.append(frameHost);
    split.append(frameSlot, inspectorSlot);

    return { split, frameSlot, inspectorSlot };
}

export function setPreviewInspectorPosition(
    split: HTMLElement,
    inspectorSlot: HTMLElement,
    position: QaapPreviewInspectorPosition,
): void {
    writePreviewInspectorPosition(position);
    applyPreviewInspectorPanelSize(inspectorSlot, split);
    syncPreviewInspectorResizeHandleOrientation(split, position);
}
