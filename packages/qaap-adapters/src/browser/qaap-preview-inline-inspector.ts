// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { addEventListener } from '@theia/core/lib/browser/widgets/widget';
import { nls } from '@theia/core/lib/common/nls';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import {
    mountEmbeddedElementInspector,
    type EmbeddedElementInspectorHost,
} from '@theia/qaap-element-inspector/lib/browser/element-inspector-panel-mount';
import {
    clampPreviewInspectorHeight,
    clampPreviewInspectorWidth,
    isPreviewInspectorMobileLayout,
    readPreviewInspectorHeight,
    readPreviewInspectorWidth,
    writePreviewInspectorHeight,
    writePreviewInspectorWidth,
} from './qaap-preview-inspector-panel-size';

export const QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE = 'qaap-preview-inspector-resize-handle';
export const QAAP_PREVIEW_INSPECTOR_RESIZING = 'qaap-mod-inspector-resizing';

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

export function applyPreviewInspectorPanelSize(inspectorSlot: HTMLElement, split: HTMLElement): void {
    const mobile = isPreviewInspectorMobileLayout();
    if (mobile) {
        const height = readPreviewInspectorHeight(split.clientHeight);
        inspectorSlot.style.width = '100%';
        inspectorSlot.style.maxWidth = 'none';
        inspectorSlot.style.height = `${height}px`;
        inspectorSlot.style.flex = `0 0 ${height}px`;
        return;
    }
    const width = readPreviewInspectorWidth(split.clientWidth);
    inspectorSlot.style.width = `${width}px`;
    inspectorSlot.style.flex = `0 0 ${width}px`;
    inspectorSlot.style.maxWidth = 'none';
    inspectorSlot.style.height = '';
}

export function wirePreviewInspectorResize(
    split: HTMLElement,
    inspectorSlot: HTMLElement,
    toDispose: DisposableCollection,
): void {
    inspectorSlot.classList.add('qaap-preview-inspector-slot--resizable');
    applyPreviewInspectorPanelSize(inspectorSlot, split);

    const handle = document.createElement('div');
    handle.className = QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', isPreviewInspectorMobileLayout() ? 'horizontal' : 'vertical');
    handle.setAttribute('aria-label', nls.localize('qaap/preview/resizeInspector', 'Resize element inspector panel'));
    handle.tabIndex = 0;
    inspectorSlot.prepend(handle);

    let resizePointerId: number | undefined;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartWidth = 0;
    let dragStartHeight = 0;

    const mobileLayout = (): boolean => isPreviewInspectorMobileLayout();

    const persistSize = (): void => {
        if (mobileLayout()) {
            writePreviewInspectorHeight(inspectorSlot.getBoundingClientRect().height, split.clientHeight);
        } else {
            writePreviewInspectorWidth(inspectorSlot.getBoundingClientRect().width, split.clientWidth);
        }
    };

    const stopDrag = (e: PointerEvent): void => {
        if (resizePointerId === undefined || e.pointerId !== resizePointerId) {
            return;
        }
        try {
            handle.releasePointerCapture(e.pointerId);
        } catch {
            /* already released */
        }
        resizePointerId = undefined;
        document.body.classList.remove(QAAP_PREVIEW_INSPECTOR_RESIZING);
        document.body.classList.remove(`${QAAP_PREVIEW_INSPECTOR_RESIZING}-vertical`);
        persistSize();
    };

    const onPointerMove = (e: PointerEvent): void => {
        if (resizePointerId === undefined || e.pointerId !== resizePointerId) {
            return;
        }
        if (mobileLayout()) {
            const bounded = clampPreviewInspectorHeight(
                dragStartHeight + (e.clientY - dragStartY),
                split.clientHeight,
            );
            inspectorSlot.style.height = `${bounded}px`;
            inspectorSlot.style.flex = `0 0 ${bounded}px`;
            return;
        }
        const bounded = clampPreviewInspectorWidth(
            dragStartWidth + (dragStartX - e.clientX),
            split.clientWidth,
        );
        inspectorSlot.style.width = `${bounded}px`;
        inspectorSlot.style.flex = `0 0 ${bounded}px`;
    };

    toDispose.push(addEventListener(handle, 'pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        handle.setAttribute('aria-orientation', mobileLayout() ? 'horizontal' : 'vertical');
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartWidth = inspectorSlot.getBoundingClientRect().width;
        dragStartHeight = inspectorSlot.getBoundingClientRect().height;
        resizePointerId = e.pointerId;
        handle.setPointerCapture(e.pointerId);
        document.body.classList.add(QAAP_PREVIEW_INSPECTOR_RESIZING);
        if (mobileLayout()) {
            document.body.classList.add(`${QAAP_PREVIEW_INSPECTOR_RESIZING}-vertical`);
        }
    }));
    toDispose.push(addEventListener(handle, 'pointermove', onPointerMove));
    toDispose.push(addEventListener(handle, 'pointerup', stopDrag));
    toDispose.push(addEventListener(handle, 'pointercancel', stopDrag));
    toDispose.push(addEventListener(handle, 'lostpointercapture', () => {
        if (resizePointerId === undefined) {
            return;
        }
        resizePointerId = undefined;
        document.body.classList.remove(QAAP_PREVIEW_INSPECTOR_RESIZING);
        document.body.classList.remove(`${QAAP_PREVIEW_INSPECTOR_RESIZING}-vertical`);
        persistSize();
    }));

    toDispose.push(addEventListener(handle, 'keydown', (e: KeyboardEvent) => {
        const step = e.shiftKey ? 32 : 16;
        if (mobileLayout()) {
            const current = inspectorSlot.getBoundingClientRect().height;
            let next = current;
            if (e.key === 'ArrowUp') {
                next = current - step;
            } else if (e.key === 'ArrowDown') {
                next = current + step;
            } else {
                return;
            }
            e.preventDefault();
            const bounded = clampPreviewInspectorHeight(next, split.clientHeight);
            inspectorSlot.style.height = `${bounded}px`;
            inspectorSlot.style.flex = `0 0 ${bounded}px`;
            writePreviewInspectorHeight(bounded, split.clientHeight);
            return;
        }
        const current = inspectorSlot.getBoundingClientRect().width;
        let next = current;
        if (e.key === 'ArrowLeft') {
            next = current + step;
        } else if (e.key === 'ArrowRight') {
            next = current - step;
        } else {
            return;
        }
        e.preventDefault();
        const bounded = clampPreviewInspectorWidth(next, split.clientWidth);
        inspectorSlot.style.width = `${bounded}px`;
        inspectorSlot.style.flex = `0 0 ${bounded}px`;
        writePreviewInspectorWidth(bounded, split.clientWidth);
    }));

    const onWindowResize = (): void => {
        if (!inspectorSlot.hidden) {
            applyPreviewInspectorPanelSize(inspectorSlot, split);
        }
    };
    window.addEventListener('resize', onWindowResize);
    toDispose.push(Disposable.create(() => window.removeEventListener('resize', onWindowResize)));
}
