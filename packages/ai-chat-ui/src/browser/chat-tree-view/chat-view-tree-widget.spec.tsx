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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { OpenerService } from '@theia/core/lib/browser';
import { MarkdownRender } from '../chat-response-renderer/markdown-part-renderer';
import { BLOCKED_RESOURCE_CLASS } from '../chat-response-renderer/block-external-resources';
import { ChatRequestRender, ChatViewTreeWidget, RequestNode, ResponseNode } from './chat-view-tree-widget';

disableJSDOM();

describe('chat-view-tree-widget resource blocking policy', () => {
    let container: HTMLElement;
    let root: Root;
    const openerService: OpenerService = {
        getOpener: async () => ({ open: async () => undefined }),
        getOpeners: async () => [],
        open: async () => undefined
    } as unknown as OpenerService;

    const externalImageMarkdown = '![](https://evil.com/x.gif)';
    const inlineIframeMarkdown = '<iframe srcdoc="&lt;p&gt;hi&lt;/p&gt;"></iframe>';

    const createRequestNode = (markdown: string): RequestNode => ({
        request: {
            message: { parts: [{ text: markdown }] },
            context: { variables: [] }
        },
        branch: { items: [] }
    } as unknown as RequestNode);

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

    it('renders external resources directly for user requests', done => {
        root.render(
            <ChatRequestRender
                node={createRequestNode(externalImageMarkdown)}
                hoverService={{} as never}
                chatAgentService={{} as never}
                variableService={{} as never}
                openerService={openerService}
                provideChatInputWidget={() => undefined}
            />
        );

        setTimeout(() => {
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
            expect(container.querySelector('img')?.getAttribute('src')).to.equal('https://evil.com/x.gif');
            done();
        }, 50);
    });

    it('still blocks active embedded content for user requests', done => {
        root.render(
            <ChatRequestRender
                node={createRequestNode(inlineIframeMarkdown)}
                hoverService={{} as never}
                chatAgentService={{} as never}
                variableService={{} as never}
                openerService={openerService}
                provideChatInputWidget={() => undefined}
            />
        );

        setTimeout(() => {
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
            expect(container.querySelector('iframe')).to.be.null;
            done();
        }, 50);
    });

    it('blocks external resources for assistant responses', done => {
        root.render(<MarkdownRender text={externalImageMarkdown} openerService={openerService} />);

        setTimeout(() => {
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
            expect(container.querySelector('img')).to.be.null;
            done();
        }, 50);
    });
});

describe('chat-view-tree-widget aria label', () => {
    const widget = Object.create(ChatViewTreeWidget.prototype) as ChatViewTreeWidget;
    (widget as unknown as { getAgent: () => { name: string } }).getAgent = () => ({ name: 'Coder' });
    const ariaLabel = (node: RequestNode | ResponseNode): string =>
        (widget as unknown as { getChatNodeAriaLabel(node: RequestNode | ResponseNode): string }).getChatNodeAriaLabel(node);
    const request = { request: {}, sessionId: 's' } as unknown as RequestNode;
    const response = { response: {}, sessionId: 's' } as unknown as ResponseNode;

    it('names the request and the response', () => {
        expect(ariaLabel(request)).to.equal('Your message');
        expect(ariaLabel(response)).to.equal('Response from Coder');
    });

    it('says that a compaction excludes a stale message from future prompts', () => {
        expect(ariaLabel({ ...request, isStale: true })).to.equal('Your message, compacted and not sent in future prompts');
        expect(ariaLabel({ ...response, isStale: true })).to.equal('Response from Coder, compacted and not sent in future prompts');
    });
});
