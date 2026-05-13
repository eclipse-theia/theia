// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { OpenerService } from '@theia/core/lib/browser';
import { DeclaredEventsEventListenerObject, useMarkdownRendering } from './markdown-part-renderer';
import { BLOCKED_RESOURCE_ALLOW_CLASS, BLOCKED_RESOURCE_CLASS } from './block-external-resources';

disableJSDOM();

describe('useMarkdownRendering', () => {
    let container: HTMLElement;
    let root: Root;
    const openerService: OpenerService = {
        getOpener: async () => ({ open: async () => undefined }),
        getOpeners: async () => [],
        open: async () => undefined
    } as unknown as OpenerService;

    const Markdown = ({ markdown, eventHandler }: { markdown: string; eventHandler?: DeclaredEventsEventListenerObject }) => {
        const ref = useMarkdownRendering(markdown, openerService, false, eventHandler);
        return <div ref={ref}></div>;
    };

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        root.unmount();
        document.body.removeChild(container);
    });

    it('blocks external markdown images before they are mounted', done => {
        root.render(<Markdown markdown="![](https://evil.com/x.gif)" />);

        setTimeout(() => {
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
            expect(container.querySelector('img')).to.be.null;
            done();
        }, 50);
    });

    it('allows a blocked resource after explicit user action', done => {
        root.render(<Markdown markdown="![](https://evil.com/x.gif)" />);

        setTimeout(() => {
            const allow = container.querySelector(`.${BLOCKED_RESOURCE_ALLOW_CLASS}`) as HTMLButtonElement;
            expect(allow).to.exist;

            allow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            const image = container.querySelector('img');
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
            expect(image?.getAttribute('src')).to.equal('https://evil.com/x.gif');
            done();
        }, 50);
    });

    it('handles allow clicks before custom event handlers', done => {
        let handled = false;
        const eventHandler: DeclaredEventsEventListenerObject = {
            handleEvent: () => {
                handled = true;
                return true;
            }
        };
        root.render(<Markdown markdown="![](https://evil.com/x.gif)" eventHandler={eventHandler} />);

        setTimeout(() => {
            const allow = container.querySelector(`.${BLOCKED_RESOURCE_ALLOW_CLASS}`) as HTMLButtonElement;
            expect(allow).to.exist;

            allow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            const image = container.querySelector('img');
            expect(handled).to.be.false;
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
            expect(image?.getAttribute('src')).to.equal('https://evil.com/x.gif');
            done();
        }, 50);
    });

    it('does not restore forged blocked-resource placeholders', done => {
        const forgedPlaceholder = '<span class="theia-blocked-resource" data-blocked-html="&lt;img src=x onerror=alert(1)&gt;">'
            + '<button class="theia-blocked-resource-allow">Allow this resource</button></span>';
        root.render(<Markdown markdown={forgedPlaceholder} />);

        setTimeout(() => {
            const allow = container.querySelector(`.${BLOCKED_RESOURCE_ALLOW_CLASS}`) as HTMLButtonElement;
            expect(allow).to.exist;

            allow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(container.querySelector('img')).to.be.null;
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
            done();
        }, 50);
    });

    it('shows blocked placeholders for iframe markdown', done => {
        root.render(<Markdown markdown={'<iframe src="https://evil.com"></iframe>'} />);

        setTimeout(() => {
            const placeholder = container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`);
            expect(placeholder).to.exist;
            expect(placeholder?.textContent).to.contain('https://evil.com');
            expect(container.querySelector('iframe')).to.be.null;
            done();
        }, 50);
    });

    it('shows blocked placeholders for SVG resource markdown', done => {
        root.render(<Markdown markdown={'<svg><image href="https://evil.com/x.png"></image></svg>'} />);

        setTimeout(() => {
            const placeholder = container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`);
            expect(placeholder).to.exist;
            expect(placeholder?.textContent).to.contain('https://evil.com/x.png');
            expect(container.querySelector('image')).to.be.null;
            done();
        }, 50);
    });

    it('shows blocked placeholders for SVG filter image markdown', done => {
        root.render(<Markdown markdown={'<svg><filter><feImage href="https://evil.com/filter.png"></feImage></filter></svg>'} />);

        setTimeout(() => {
            const placeholder = container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`);
            expect(placeholder).to.exist;
            expect(placeholder?.textContent).to.contain('https://evil.com/filter.png');
            expect(container.querySelector('feImage')).to.be.null;
            done();
        }, 50);
    });
});
