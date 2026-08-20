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

describe('HoverService', () => {
    let container: Container;
    let hoverService: HoverService;

    before(() => {
        disableJSDOM = enableJSDOM();
        // The hover service positions its host after waiting for an animation frame.
        // JSDOM (without pretendToBeVisual) does not provide requestAnimationFrame.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
    });

    after(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (global as any).requestAnimationFrame;
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();
        container.bind(HoverService).toSelf().inSingletonScope();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        container.bind(PreferenceService).toConstantValue({ get: () => 0 } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        container.bind(CoreMarkdownRenderer).toConstantValue({ render: () => ({ element: document.createElement('div'), dispose: () => { } }) } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        container.bind(OpenerService).toConstantValue({} as any);
        hoverService = container.get(HoverService);
        stubPopoverApi(hoverService);
    });

    afterEach(() => {
        hoverService.cancelHover();
    });

    /**
     * JSDOM implements neither the Popover API (showPopover/hidePopover) nor the
     * `:popover-open` pseudo-class, so stub them on the service's host element.
     */
    function stubPopoverApi(service: HoverService): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const host: HTMLElement = (service as any).hoverHost;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (host as any).showPopover = () => { };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (host as any).hidePopover = () => { };
        const originalMatches = host.matches.bind(host);
        host.matches = (selectors: string) => selectors === ':popover-open' ? false : originalMatches(selectors);
    }

    function waitForHover(): Promise<void> {
        // hover delay (0ms timeout) + animation frame (0ms timeout stub)
        return new Promise(resolve => setTimeout(resolve, 20));
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
        const secondaryDocument = document.implementation.createHTMLDocument('secondary window');
        const target = secondaryDocument.createElement('div');
        secondaryDocument.body.appendChild(target);
        hoverService.requestHover({ content: 'secondary window hover', target, position: 'right', skipHoverDelay: true });
        await waitForHover();
        expect(document.querySelector('.theia-hover'), 'hover should not be in the main document').to.not.exist;
        expect(secondaryDocument.querySelector('.theia-hover'), 'hover should be in the secondary document').to.exist;
        target.remove();
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const host: HTMLElement = (hoverService as any).hoverHost;
            host.getBoundingClientRect = () => rect(0, 0, 300, 50);
            originalBodyRect = document.body.getBoundingClientRect.bind(document.body);
            document.body.getBoundingClientRect = () => rect(0, 0, windowWidth, windowHeight);
            Object.defineProperty(document.documentElement, 'scrollHeight', { value: windowHeight, configurable: true });
        });

        afterEach(() => {
            document.body.getBoundingClientRect = originalBodyRect;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (document.documentElement as any).scrollHeight;
            target.remove();
        });

        function setHostPosition(position: 'left' | 'right' | 'top' | 'bottom'): string {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const host: HTMLElement = (hoverService as any).hoverHost;
            host.getBoundingClientRect = () => rect(0, 0, 300, windowHeight); // hover as tall as the window
            target.getBoundingClientRect = () => rect(0, 100, windowWidth, 20);
            expect(setHostPosition('left')).to.equal('right');
        });
    });

    it('recovers if the document hosting an open hover is no longer active', async () => {
        // simulate a hover host left popover-open in a closed secondary window's document:
        // hidePopover then throws 'InvalidStateError' and must not break subsequent hovers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const host: HTMLElement = (hoverService as any).hoverHost;
        host.matches = (selectors: string) => selectors === ':popover-open';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (host as any).hidePopover = () => { throw new Error('InvalidStateError: not fully active'); };
        const target = document.createElement('div');
        document.body.appendChild(target);
        hoverService.requestHover({ content: 'after window close', target, position: 'right', skipHoverDelay: true });
        stubPopoverApi(hoverService); // restore working popover stubs for the new hover
        await waitForHover();
        expect(document.querySelector('.theia-hover'), 'hover should be rendered again in the main document').to.exist;
        target.remove();
    });
});
