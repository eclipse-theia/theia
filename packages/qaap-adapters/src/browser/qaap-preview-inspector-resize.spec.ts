// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS,
    ensurePreviewInspectorPanelRoot,
} from '@theia/qaap-element-inspector/lib/browser/preview-inspector-panel-root';
import { applyPreviewInspectorPanelSize } from './qaap-preview-inspector-panel-size';
import {
    QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE,
    wirePreviewInspectorResize,
} from './qaap-preview-inspector-resize-wiring';

disableJSDOM();

describe('qaap-preview-inspector-resize', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        if (typeof window.matchMedia !== 'function') {
            window.matchMedia = () => ({
                matches: false,
                media: '',
                onchange: null,
                addListener: () => undefined,
                removeListener: () => undefined,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
                dispatchEvent: () => false,
            } as MediaQueryList);
        }
        if (!HTMLElement.prototype.setPointerCapture) {
            HTMLElement.prototype.setPointerCapture = () => undefined;
            HTMLElement.prototype.releasePointerCapture = () => undefined;
        }
        if (typeof PointerEvent === 'undefined') {
            class PointerEventPolyfill extends MouseEvent {
                readonly pointerId: number;
                constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
                    super(type, init);
                    this.pointerId = init.pointerId ?? 0;
                }
            }
            (globalThis as typeof globalThis & { PointerEvent: typeof PointerEvent }).PointerEvent =
                PointerEventPolyfill as unknown as typeof PointerEvent;
        }
    });

    after(() => {
        disableJSDOM();
    });

    function createSplit(): { split: HTMLElement; frameSlot: HTMLElement; inspectorSlot: HTMLElement } {
        const split = document.createElement('div');
        split.className = 'qaap-preview-split';
        const frameSlot = document.createElement('div');
        frameSlot.className = 'qaap-preview-frame-slot';
        const inspectorSlot = document.createElement('aside');
        inspectorSlot.className = 'qaap-preview-inspector-slot';
        split.append(frameSlot, inspectorSlot);
        document.body.append(split);
        Object.defineProperty(split, 'clientWidth', { value: 1000, configurable: true });
        Object.defineProperty(split, 'clientHeight', { value: 800, configurable: true });
        return { split, frameSlot, inspectorSlot };
    }

    it('places resize handle on the split between frame and inspector', () => {
        const { split, frameSlot, inspectorSlot } = createSplit();
        const toDispose = new DisposableCollection();
        wirePreviewInspectorResize(split, inspectorSlot, toDispose);
        const handle = split.querySelector(`:scope > .${QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE}`);
        expect(handle).to.exist;
        expect(split.children.length).to.equal(3);
        expect(split.children[0]).to.equal(frameSlot);
        expect(split.children[1]).to.equal(handle);
        expect(split.children[2]).to.equal(inspectorSlot);
        toDispose.dispose();
    });

    it('keeps resize handle after panel root is ensured (React mount target)', () => {
        const { split, inspectorSlot } = createSplit();
        const toDispose = new DisposableCollection();
        wirePreviewInspectorResize(split, inspectorSlot, toDispose);
        const panelRoot = ensurePreviewInspectorPanelRoot(inspectorSlot);
        panelRoot.innerHTML = '<div class="theia-mini-browser-inspector__root">panel</div>';
        expect(split.querySelector(`:scope > .${QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE}`)).to.exist;
        expect(inspectorSlot.querySelector(`:scope > .${QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS}`)).to.equal(panelRoot);
        toDispose.dispose();
    });

    it('updates inspector width while dragging the split handle horizontally', () => {
        const { split, inspectorSlot } = createSplit();
        applyPreviewInspectorPanelSize(inspectorSlot, split);
        const toDispose = new DisposableCollection();
        wirePreviewInspectorResize(split, inspectorSlot, toDispose);
        const handle = split.querySelector(`:scope > .${QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE}`) as HTMLElement;
        const startWidth = 320;
        Object.defineProperty(inspectorSlot, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: startWidth,
                height: 400,
                top: 0,
                left: 0,
                right: startWidth,
                bottom: 400,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });
        handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 100, button: 0, pointerId: 1 }));
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: 460, clientY: 100, pointerId: 1 }));
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: 460, clientY: 100, pointerId: 1 }));
        const widthPx = Number.parseInt(inspectorSlot.style.width, 10);
        expect(widthPx).to.equal(startWidth + 40);
        toDispose.dispose();
    });

    it('does not register duplicate resize handles', () => {
        const { split, inspectorSlot } = createSplit();
        const toDispose = new DisposableCollection();
        wirePreviewInspectorResize(split, inspectorSlot, toDispose);
        wirePreviewInspectorResize(split, inspectorSlot, toDispose);
        expect(split.querySelectorAll(`:scope > .${QAAP_PREVIEW_INSPECTOR_RESIZE_HANDLE}`).length).to.equal(1);
        toDispose.dispose();
    });
});
