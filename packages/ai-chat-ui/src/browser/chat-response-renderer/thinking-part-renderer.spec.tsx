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

import { ChatResponseContent, ThinkingChatResponseContent } from '@theia/ai-chat';
import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { ResponseNode } from '../chat-tree-view';
import { ThinkingPartRenderer } from './thinking-part-renderer';

const thinking = (content: string): ThinkingChatResponseContent => ({
    kind: 'thinking',
    content,
    signature: 'signature',
    asString: () => content,
    asDisplayString: () => content,
    merge: () => true
} as unknown as ThinkingChatResponseContent);

const responseNode = (
    content: ChatResponseContent[],
    state: { isComplete?: boolean, isCanceled?: boolean, isError?: boolean } = {}
): ResponseNode => ({
    id: 'response-1',
    sessionId: 'session-1',
    parent: undefined,
    response: {
        isComplete: false,
        isCanceled: false,
        isError: false,
        ...state,
        response: { content }
    }
} as unknown as ResponseNode);

/** The rendered element is a `ThinkingContent`; its `active` prop is what drives expand/collapse. */
const isActive = (node: React.ReactNode): boolean => (node as React.ReactElement<{ active: boolean }>).props.active;

disableJSDOM();

describe('ThinkingPartRenderer', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('only handles thinking parts', () => {
        const renderer = new ThinkingPartRenderer();
        expect(renderer.canHandle(thinking('...'))).to.be.greaterThan(0);
        expect(renderer.canHandle({ kind: 'text' } as ChatResponseContent)).to.be.lessThan(0);
    });

    it('renders the thinking content', () => {
        const renderer = new ThinkingPartRenderer();
        const part = thinking('Let me check the imports first.');
        const node = renderer.render(part, responseNode([part]));
        expect(JSON.stringify(node)).to.contain('Let me check the imports first.');
    });

    it('is active while it is the last part of a running response', () => {
        const renderer = new ThinkingPartRenderer();
        const part = thinking('...');
        expect(isActive(renderer.render(part, responseNode([part])))).to.be.true;
    });

    it('is inactive once a later part has arrived', () => {
        const renderer = new ThinkingPartRenderer();
        const part = thinking('...');
        const node = responseNode([part, { kind: 'text' } as ChatResponseContent]);
        expect(isActive(renderer.render(part, node))).to.be.false;
    });

    it('is inactive for a completed, canceled or failed response', () => {
        const renderer = new ThinkingPartRenderer();
        const part = thinking('...');
        expect(isActive(renderer.render(part, responseNode([part], { isComplete: true })))).to.be.false;
        expect(isActive(renderer.render(part, responseNode([part], { isCanceled: true })))).to.be.false;
        expect(isActive(renderer.render(part, responseNode([part], { isError: true })))).to.be.false;
    });

    it('is inactive without a parent node', () => {
        const renderer = new ThinkingPartRenderer();
        expect(isActive(renderer.render(thinking('...')))).to.be.false;
    });

});
