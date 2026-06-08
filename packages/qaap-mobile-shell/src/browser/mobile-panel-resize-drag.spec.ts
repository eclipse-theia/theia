// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { expect } from 'chai';
import { installMobilePanelResizeDrag } from './mobile-panel-resize-drag';

describe('mobile-panel-resize-drag', () => {

    let disableJSDOM: () => void;

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

    it('emits move deltas from pointer drag', () => {
        const handle = document.createElement('div');
        document.body.append(handle);
        const moves: Array<{ clientX: number; startClientX: number }> = [];
        let started = 0;
        let ended = 0;

        const dispose = installMobilePanelResizeDrag({
            handle,
            onStart: () => {
                started += 1;
            },
            onMove: event => {
                moves.push({ clientX: event.clientX, startClientX: event.startClientX });
            },
            onEnd: () => {
                ended += 1;
            },
        });

        handle.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: 120,
            clientY: 40,
            button: 0,
            pointerId: 7,
            pointerType: 'mouse',
        }));
        handle.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: 150,
            clientY: 40,
            button: 0,
            pointerId: 7,
            pointerType: 'mouse',
        }));
        handle.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            clientX: 150,
            clientY: 40,
            button: 0,
            pointerId: 7,
            pointerType: 'mouse',
        }));

        expect(started).to.equal(1);
        expect(ended).to.equal(1);
        expect(moves).to.deep.equal([{ clientX: 150, startClientX: 120 }]);

        dispose.dispose();
        handle.remove();
    });

    it('respects enabled()', () => {
        const handle = document.createElement('div');
        document.body.append(handle);
        let started = 0;

        const dispose = installMobilePanelResizeDrag({
            handle,
            enabled: () => false,
            onStart: () => {
                started += 1;
            },
            onMove: () => undefined,
        });

        handle.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: 10,
            clientY: 10,
            button: 0,
            pointerId: 1,
            pointerType: 'mouse',
        }));

        expect(started).to.equal(0);
        dispose.dispose();
        handle.remove();
    });
});
