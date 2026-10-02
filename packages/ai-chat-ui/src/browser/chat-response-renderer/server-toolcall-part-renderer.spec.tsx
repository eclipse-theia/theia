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
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { HoverRequest, HoverService, OpenerService } from '@theia/core/lib/browser';
import { ServerToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ServerToolCallPartRenderer } from './server-toolcall-part-renderer';

disableJSDOM();

describe('ServerToolCallPartRenderer tooltips', () => {
    let container: HTMLElement;
    let root: Root;
    let requests: HoverRequest[];
    let renderer: ServerToolCallPartRenderer;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        requests = [];
        renderer = new ServerToolCallPartRenderer();
        const fields = renderer as unknown as { hoverService: HoverService; openerService: OpenerService };
        fields.hoverService = { requestHover: (request: HoverRequest) => requests.push(request) } as unknown as HoverService;
        fields.openerService = {} as OpenerService;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        root.unmount();
        document.body.removeChild(container);
    });

    function renderToolCall(finished: boolean): void {
        const response = {
            kind: 'serverToolCall',
            name: 'web_search',
            arguments: JSON.stringify({ query: 'eclipse theia', allowed_domains: ['eclipse.dev'], max_uses: 5 }),
            finished
        } as ServerToolCallChatResponseContent;
        flushSync(() => root.render(renderer.render(response)));
    }

    function hover(element: Element): void {
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    }

    it('anchors the arguments tooltip of a finished call to the inline label, not the full-width summary', () => {
        renderToolCall(true);
        const summary = container.querySelector('summary')!;

        hover(container.querySelector('.theia-toolCall-args-label')!);

        expect(requests).to.have.lengthOf(1);
        const target = requests[0].target;
        expect(target).to.not.equal(summary);
        expect(target.tagName).to.equal('SPAN');
        expect(target.parentElement).to.equal(summary);
        expect(target.textContent).to.contain('web_search');
    });

    it('anchors the arguments tooltip of a running call to its inline label', () => {
        renderToolCall(false);

        hover(container.querySelector('.theia-toolCall-args-label')!);

        expect(requests).to.have.lengthOf(1);
        expect(requests[0].target).to.equal(container.querySelector('.theia-toolCall-allowed'));
    });

    it('anchors the server tooltip to the badge', () => {
        renderToolCall(true);
        const badge = container.querySelector('.theia-serverToolCall-badge')!;

        hover(badge);

        expect(requests).to.have.lengthOf(1);
        expect(requests[0].target).to.equal(badge);
    });
});
