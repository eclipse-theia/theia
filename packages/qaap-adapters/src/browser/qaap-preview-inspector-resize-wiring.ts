// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { addEventListener } from '@theia/core/lib/browser/widgets/widget';
import { nls } from '@theia/core/lib/common/nls';
import { ensurePreviewInspectorPanelRoot } from '@theia/qaap-element-inspector/lib/browser/preview-inspector-panel-root';
import {
    applyPreviewInspectorPanelSize,
    clampPreviewInspectorHeight,
    clampPreviewInspectorWidth,
    type QaapPreviewInspectorPosition,
    readPreviewInspectorPosition,
    writePreviewInspectorHeight,
    writePreviewInspectorWidth,
} from './qaap-preview-inspector-panel-size';

export const QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE = 'qaap-preview-inspector-resize-handle';
export const QAAP_PREVIEW_INSPECTOR_RESIZING = 'qaap-mod-inspector-resizing';

export function syncPreviewInspectorResizeHandleOrientation(split: HTMLElement, position: QaapPreviewInspectorPosition): void {
    const handle = split.querySelector(`:scope > .${QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE}`);
    if (handle instanceof HTMLElement) {
        handle.setAttribute('aria-orientation', position === 'bottom' ? 'horizontal' : 'vertical');
    }
}

export function wirePreviewInspectorResize(
    split: HTMLElement,
    inspectorSlot: HTMLElement,
    toDispose: DisposableCollection,
): void {
    if (split.querySelector(`:scope > .${QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE}`)) {
        return;
    }
    inspectorSlot.classList.add('qaap-preview-inspector-slot--resizable');
    ensurePreviewInspectorPanelRoot(inspectorSlot);
    applyPreviewInspectorPanelSize(inspectorSlot, split);

    const handle = document.createElement('div');
    handle.className = QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', readPreviewInspectorPosition() === 'bottom' ? 'horizontal' : 'vertical');
    handle.setAttribute('aria-label', nls.localize('qaap/preview/resizeInspector', 'Resize element inspector panel'));
    handle.tabIndex = 0;
    split.insertBefore(handle, inspectorSlot);

    let resizePointerId: number | undefined;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartWidth = 0;
    let dragStartHeight = 0;

    const stackedLayout = (): boolean => readPreviewInspectorPosition() === 'bottom';

    const persistSize = (): void => {
        if (stackedLayout()) {
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
        if (stackedLayout()) {
            const bounded = clampPreviewInspectorHeight(
                dragStartHeight + (dragStartY - e.clientY),
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
        handle.setAttribute('aria-orientation', stackedLayout() ? 'horizontal' : 'vertical');
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartWidth = inspectorSlot.getBoundingClientRect().width;
        dragStartHeight = inspectorSlot.getBoundingClientRect().height;
        resizePointerId = e.pointerId;
        handle.setPointerCapture(e.pointerId);
        document.body.classList.add(QAAP_PREVIEW_INSPECTOR_RESIZING);
        if (stackedLayout()) {
            document.body.classList.add(`${QAAP_PREVIEW_INSPECTOR_RESIZING}-vertical`);
        }
    }));
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    toDispose.push(Disposable.create(() => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopDrag);
        window.removeEventListener('pointercancel', stopDrag);
    }));
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
        if (stackedLayout()) {
            const current = inspectorSlot.getBoundingClientRect().height;
            let next = current;
            if (e.key === 'ArrowUp') {
                next = current + step;
            } else if (e.key === 'ArrowDown') {
                next = current - step;
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
