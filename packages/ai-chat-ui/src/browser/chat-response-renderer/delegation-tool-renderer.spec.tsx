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

import { ChatRequestInvocation, ChatResponseModel, ToolCallChatResponseContentImpl } from '@theia/ai-chat';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { AGENT_DELEGATION_FUNCTION_ID } from '@theia/ai-core';
import { Event } from '@theia/core';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ResponseNode } from '../chat-tree-view';
import { DelegationToolRenderer } from './delegation-tool-renderer';

disableJSDOM();

describe('DelegationToolRenderer cancel button', () => {
    let container: HTMLElement;
    let root: Root;
    let cancelDelegation: sinon.SinonStub;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        cancelDelegation = sinon.stub();
    });

    afterEach(() => {
        root.unmount();
        container.remove();
    });

    async function renderDelegation(): Promise<void> {
        const response = {
            id: 'response-id',
            isComplete: false,
            isCanceled: false,
            isError: false,
            pendingInteractions: [],
            onDidChange: Event.None,
            onInteractionNeeded: Event.None
        } as unknown as ChatResponseModel;
        const invocation = {
            responseCreated: Promise.resolve(response),
            responseCompleted: new Promise(() => { })
        } as unknown as ChatRequestInvocation;
        const renderer = new DelegationToolRenderer();
        Object.assign(renderer, {
            agentDelegationTool: { getDelegation: () => ({ prompt: 'work', invocation }), cancelDelegation },
            chatAgentService: { getAgent: () => ({ name: 'Test Agent' }) },
            subChatWidgetFactory: () => ({ renderChatResponse: () => undefined }),
            toolInvocationRegistry: { getFunction: () => undefined },
            toolConfirmationManager: { getConfirmationMode: () => ToolConfirmationMode.ALWAYS_ALLOW },
            keybindingRegistry: { getKeybindingsForCommand: () => [] },
            chatResponsePartRenderers: { getContributions: () => [] }
        });
        const toolCall = new ToolCallChatResponseContentImpl('tool-call-id', AGENT_DELEGATION_FUNCTION_ID, '{}');
        const parentNode = { sessionId: 'parent-id', response: { isCanceled: false } } as unknown as ResponseNode;
        flushSync(() => root.render(renderer.render(toolCall, parentNode)));
        await new Promise(resolve => setTimeout(resolve, 0));
        flushSync(() => root.render(renderer.render(toolCall, parentNode)));
    }

    it('renders an accessible stop-circle control between status and expand arrow', async () => {
        await renderDelegation();
        const button = container.querySelector<HTMLButtonElement>('.delegation-cancel-button')!;

        expect(button.title).to.equal('Cancel delegation');
        expect(button.getAttribute('aria-label')).to.equal(button.title);
        expect(button.querySelectorAll('.codicon-stop-circle')).to.have.lengthOf(1);
        expect(button.previousElementSibling?.className).to.equal('delegation-status');
        expect(button.nextElementSibling?.className).to.equal('delegation-toggle-arrow');
        expect(button.parentElement?.lastElementChild).to.equal(button.nextElementSibling);
    });

    it('cancels only its delegation and prevents summary toggling for open and closed details', async () => {
        await renderDelegation();
        const button = container.querySelector<HTMLButtonElement>('.delegation-cancel-button')!;
        const details = container.querySelector('details')!;
        const parentClick = sinon.spy();
        document.body.addEventListener('click', parentClick);

        for (const open of [false, true]) {
            details.open = open;
            const click = new MouseEvent('click', { bubbles: true, cancelable: true });
            button.dispatchEvent(click);

            expect(click.defaultPrevented).to.be.true;
            expect(details.open).to.equal(open);
        }
        expect(cancelDelegation.calledTwice).to.be.true;
        expect(cancelDelegation.alwaysCalledWithExactly('tool-call-id')).to.be.true;
        document.body.removeEventListener('click', parentClick);
        expect(parentClick.called).to.be.false;
    });
});
