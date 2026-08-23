// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from './test/jsdom';
let disableJSDOM = enableJSDOM();

import { Container } from 'inversify';
import { expect } from 'chai';
import { HoverService } from './hover-service';
import { PreferenceService } from '../common';
import { CoreMarkdownRenderer } from './markdown-rendering/markdown-renderer';
import { OpenerService } from './opener-service';

disableJSDOM();

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('HoverService', () => {
    let container: Container;
    let hoverService: HoverService;
    let originalMatches: (selectors: string) => boolean;

    before(() => {
        disableJSDOM = enableJSDOM();
        // The hover service positions its host after waiting for an animation frame.
        // JSDOM (without pretendToBeVisual) does not provide requestAnimationFrame.
        (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
        // JSDOM implements neither the Popover API (showPopover/hidePopover) nor the
        // `:popover-open` pseudo-class: stub them, tracking the open state in an attribute.
        const elementPrototype = window.HTMLElement.prototype as any;
        elementPrototype.showPopover = function (this: HTMLElement): void { this.setAttribute('data-test-popover-open', 'true'); };
        elementPrototype.hidePopover = function (this: HTMLElement): void { this.removeAttribute('data-test-popover-open'); };
        originalMatches = elementPrototype.matches;
        elementPrototype.matches = function (this: HTMLElement, selectors: string): boolean {
            return selectors === ':popover-open' ? this.hasAttribute('data-test-popover-open') : originalMatches.call(this, selectors);
        };
    });

    after(() => {
        const elementPrototype = window.HTMLElement.prototype as any;
        delete elementPrototype.showPopover;
        delete elementPrototype.hidePopover;
        elementPrototype.matches = originalMatches;
        delete (global as any).requestAnimationFrame;
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();
        container.bind(HoverService).toSelf().inSingletonScope();
        container.bind(PreferenceService).toConstantValue({ get: () => 0 } as any);
        container.bind(CoreMarkdownRenderer).toConstantValue({ render: () => ({ element: document.createElement('div'), dispose: () => { } }) } as any);
        container.bind(OpenerService).toConstantValue({} as any);
        hoverService = container.get(HoverService);
    });

    afterEach(() => {
        hoverService.cancelHover();
    });

    function waitForHover(): Promise<void> {
        // hover delay (0ms timeout) + animation frame (0ms timeout stub)
        return new Promise(resolve => setTimeout(resolve, 20));
    }

    function waitForMouseOutDismissal(): Promise<void> {
        // the mouse-out handler re-checks the hover state after quickMouseThresholdMillis (200ms)
        return new Promise(resolve => setTimeout(resolve, 250));
    }

    interface FakeSecondaryWindow {
        secondaryDocument: Document;
        fireEvent(type: string): void;
    }

    /**
     * Creates a document simulating one hosted in a secondary window: unlike a document from
     * `createHTMLDocument`, it has a `defaultView` window on which the hover service can listen
     * for the window going away.
     */
    function createSecondaryWindowDocument(options?: { closed?: boolean }): FakeSecondaryWindow {
        const secondaryDocument = document.implementation.createHTMLDocument('secondary window');
        const listeners = new Map<string, EventListener[]>();
        const fakeWindow = {
            closed: options?.closed ?? false,
            requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
            addEventListener: (type: string, listener: EventListener) => {
                const forType = listeners.get(type) ?? [];
                forType.push(listener);
                listeners.set(type, forType);
            },
            removeEventListener: (type: string, listener: EventListener) => {
                const forType = listeners.get(type);
                const index = forType?.indexOf(listener) ?? -1;
                if (forType && index > -1) {
                    forType.splice(index, 1);
                }
            }
        };
        Object.defineProperty(secondaryDocument, 'defaultView', { value: fakeWindow, configurable: true });
        return {
            secondaryDocument,
            fireEvent: type => [...(listeners.get(type) ?? [])].forEach(listener => listener({ type } as Event))
        };
    }

    it('renders the hover in the document of the target element', async () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        hoverService.requestHover({ content: 'main window hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(document.querySelector('.theia-hover'), 'hover should be in the main document').to.exist;
        target.remove();
    });

    it('renders the hover in a secondary window document if the target lives there', async () => {
        const { secondaryDocument } = createSecondaryWindowDocument();
        const target = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(target);
        hoverService.requestHover({ content: 'secondary window hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(document.querySelector('.theia-hover'), 'hover should not be in the main document').to.not.exist;
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be in the secondary document').to.exist;
        target.remove();
    });

    it('creates the hover host in the document of the target instead of adopting it across documents', async () => {
        const mainTarget = document.createElement('div');
        document.body.appendChild(mainTarget);
        hoverService.requestHover({ content: 'main', target: mainTarget, position: 'right', skipHoverDelay: true });
        await waitForHover();
        const mainHost = document.querySelector('.theia-hover');
        expect(mainHost, 'hover should be in the main document').to.exist;

        const { secondaryDocument } = createSecondaryWindowDocument();
        const secondaryTarget = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(secondaryTarget);
        hoverService.requestHover({ content: 'secondary', target: secondaryTarget, position: 'right', skipHoverDelay: true });
        await waitForHover();
        const secondaryHost = secondaryDocument.querySelector('.theia-hover');
        expect(secondaryHost, 'hover should be in the secondary document').to.exist;
        // moving a host into another document would make it outlive its window; a host must be
        // created in the document it is shown in
        expect(secondaryHost, 'the secondary host must not be the adopted main host').to.not.equal(mainHost);
        expect(secondaryHost!.ownerDocument).to.equal(secondaryDocument);
        mainTarget.remove();
        secondaryTarget.remove();
    });

    it('cancels the hover when the window hosting it is closed', async () => {
        const { secondaryDocument, fireEvent } = createSecondaryWindowDocument();
        const target = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(target);
        hoverService.requestHover({ content: 'secondary window hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be in the secondary document').to.exist;

        fireEvent('pagehide');
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be removed when its window closes').to.not.exist;

        // hovers in the main window must keep working afterwards
        const mainTarget = document.createElement('div');
        document.body.appendChild(mainTarget);
        hoverService.requestHover({ content: 'after window close', target: mainTarget, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(document.querySelector('.theia-hover'), 'hover should be rendered in the main document afterwards').to.exist;
        target.remove();
        mainTarget.remove();
    });

    it('dismisses the hover when the pointer leaves its target in a secondary window', async () => {
        const { secondaryDocument } = createSecondaryWindowDocument();
        const target = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(target);
        hoverService.requestHover({ content: 'secondary window hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be shown in the secondary document').to.exist;

        target.dispatchEvent(new window.Event('mouseout'));
        await waitForMouseOutDismissal();
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be dismissed after the pointer left its target').to.not.exist;
        target.remove();
    });

    it('dismisses a non-interactive hover on mousedown in a secondary window', async () => {
        const { secondaryDocument } = createSecondaryWindowDocument();
        const target = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(target);
        hoverService.requestHover({ content: 'secondary window hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be shown in the secondary document').to.exist;

        secondaryDocument.body.dispatchEvent(new window.Event('mousedown'));
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be dismissed on mousedown outside of it').to.not.exist;
        target.remove();
    });

    it('shows at most one hover box in a secondary window across repeated hovers', async () => {
        const { secondaryDocument } = createSecondaryWindowDocument();
        const target = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(target);
        for (let i = 0; i < 2; i++) {
            hoverService.requestHover({ content: `hover ${i}`, target, position: 'right', skipHoverDelay: true });
            await waitForHover();
            target.dispatchEvent(new window.Event('mouseout'));
            await waitForMouseOutDismissal();
        }
        hoverService.requestHover({ content: 'final hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(secondaryDocument.querySelectorAll('.theia-hover').length, 'stale hover hosts must not pile up').to.equal(1);
        target.remove();
    });

    it('does not render a hover for a target in an already closed window', async () => {
        const { secondaryDocument } = createSecondaryWindowDocument({ closed: true });
        const target = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(target);
        hoverService.requestHover({ content: 'closed window hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(secondaryDocument.querySelector('.theia-hover'), 'no hover should be rendered in a closed window').to.not.exist;
        expect(document.querySelector('.theia-hover'), 'no hover should be rendered in the main document either').to.not.exist;
        target.remove();
    });

    it('keeps the hover host hidden until it has been positioned', async () => {
        // the host is appended (and the popover shown) at (0, 0) first and only positioned after an
        // animation frame; it must not be hittable in the meantime: a visible popover at (0, 0) can
        // cover the target, kick it out of the hover chain and retrigger mouseenter hovers in an
        // endless show/hide loop (e.g. for tabs at the top-left corner of a secondary window)
        const target = document.createElement('div');
        document.body.appendChild(target);
        const rendering = (hoverService as any).renderHover({ content: 'positioning', target, position: 'right' }) as Promise<void>;
        const host = document.querySelector('.theia-hover') as HTMLElement;
        expect(host, 'hover should be appended synchronously').to.exist;
        expect(host.style.visibility, 'hover must not be visible before it has been positioned').to.equal('hidden');
        await rendering;
        expect(host.style.visibility, 'hover should be revealed once positioned').to.not.equal('hidden');
        target.remove();
    });

    it('does not reveal a hover that was superseded while waiting to be positioned', async () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        const service = hoverService as any;
        const first = service.renderHover({ content: 'first', target, position: 'right' }) as Promise<void>;
        const second = service.renderHover({ content: 'second', target, position: 'right' }) as Promise<void>;
        await first;
        const host = document.querySelector('.theia-hover') as HTMLElement;
        expect(host.style.visibility, 'the superseded render must not reveal the host').to.equal('hidden');
        await second;
        expect(host.style.visibility, 'the latest render reveals the host').to.not.equal('hidden');
        target.remove();
    });

    it('does not leak css classes from a hover that was superseded while waiting to be positioned', async () => {
        const service = hoverService as any;
        // keep the first render stuck waiting for its animation frame so that a second hover supersedes it mid-render
        const originalAnimationFrame = service.hostAnimationFrame.bind(service);
        let releaseFirst: () => void;
        let animationFrameCalls = 0;
        service.hostAnimationFrame = (element: HTMLElement) => ++animationFrameCalls === 1
            ? new Promise<void>(resolve => { releaseFirst = resolve; })
            : originalAnimationFrame(element);
        const target = document.createElement('div');
        document.body.appendChild(target);
        hoverService.requestHover({ content: 'first', target, position: 'right', skipHoverDelay: true, cssClasses: ['first-hover-class'] });
        await waitForHover();
        hoverService.requestHover({ content: 'second', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        releaseFirst!(); // let the superseded render finish
        await waitForHover();
        const host = document.querySelector('.theia-hover');
        expect(host, 'second hover should be rendered').to.exist;
        expect(host!.classList.contains('first-hover-class'), 'the superseded hover must not leak its css classes').to.equal(false);
        target.remove();
    });

    it('recovers if the open hover can no longer be hidden', async () => {
        // simulate a hover whose document is no longer fully active, e.g. because the secondary
        // window hosting it was closed: hidePopover throws and must not break subsequent hovers
        const target = document.createElement('div');
        document.body.appendChild(target);
        hoverService.requestHover({ content: 'first', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        const host = document.querySelector('.theia-hover') as HTMLElement;
        expect(host, 'first hover should be rendered').to.exist;
        (host as any).hidePopover = () => { throw new Error('InvalidStateError: not fully active'); };

        const secondTarget = document.createElement('div');
        document.body.appendChild(secondTarget);
        hoverService.requestHover({ content: 'second', target: secondTarget, position: 'right', skipHoverDelay: true });
        await waitForHover();
        const secondHost = document.querySelector('.theia-hover');
        expect(secondHost, 'hover should be rendered again in the main document').to.exist;
        expect(secondHost!.textContent).to.equal('second');
        target.remove();
        secondTarget.remove();
    });

    describe('position fallback', () => {
        // simulated window: 400px wide, 600px high
        const windowWidth = 400;
        const windowHeight = 600;
        let target: HTMLElement;
        let originalBodyRect: () => DOMRect;

        function rect(left: number, top: number, width: number, height: number): DOMRect {
            return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => '' };
        }

        beforeEach(() => {
            target = document.createElement('div');
            document.body.appendChild(target);
            const host: HTMLElement = (hoverService as any).hoverHost;
            host.getBoundingClientRect = () => rect(0, 0, 300, 50);
            originalBodyRect = document.body.getBoundingClientRect.bind(document.body);
            document.body.getBoundingClientRect = () => rect(0, 0, windowWidth, windowHeight);
            Object.defineProperty(document.documentElement, 'scrollHeight', { value: windowHeight, configurable: true });
        });

        afterEach(() => {
            document.body.getBoundingClientRect = originalBodyRect;
            delete (document.documentElement as any).scrollHeight;
            target.remove();
        });

        function setHostPosition(position: 'left' | 'right' | 'top' | 'bottom'): string {
            const service = hoverService as any;
            return service.setHostPosition(target, service.hoverHost, position);
        }

        it('keeps the requested position when the hover fits', () => {
            target.getBoundingClientRect = () => rect(320, 100, 60, 20); // plenty of room on the left
            expect(setHostPosition('left')).to.equal('left');
        });

        it('falls back to bottom when a left hover fits on neither side of a full-width target', () => {
            target.getBoundingClientRect = () => rect(0, 100, windowWidth, 20);
            expect(setHostPosition('left')).to.equal('bottom');
        });

        it('falls back to top when the full-width target is near the bottom of the window', () => {
            target.getBoundingClientRect = () => rect(0, windowHeight - 30, windowWidth, 20);
            expect(setHostPosition('right')).to.equal('top');
        });

        it('keeps the requested direction when the perpendicular direction does not fit either', () => {
            const host: HTMLElement = (hoverService as any).hoverHost;
            host.getBoundingClientRect = () => rect(0, 0, 300, windowHeight); // hover as tall as the window
            target.getBoundingClientRect = () => rect(0, 100, windowWidth, 20);
            expect(setHostPosition('left')).to.equal('right');
        });
    });
});
