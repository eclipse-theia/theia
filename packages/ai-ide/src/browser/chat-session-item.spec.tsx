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

import { enableJSDOM, enableReactActEnvironment } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ChatAgentLocation, ChatAgentService, ChatService, ChatSession, ToolCallChatResponseContentImpl } from '@theia/ai-chat';
import { Emitter, Event } from '@theia/core';
import { HoverService } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import * as React from '@theia/core/shared/react';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { ChatSessionItem } from './chat-session-item';
disableJSDOM();

describe('ChatSessionItem approval countdown', () => {
    let clock: sinon.SinonFakeTimers;
    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    let changed: Emitter<void>;
    let disableReactActEnvironment: () => void;

    beforeEach(() => {
        disableJSDOM = enableJSDOM();
        disableReactActEnvironment = enableReactActEnvironment();
        clock = sinon.useFakeTimers();
        container = document.createElement('div');
        root = createRoot(container);
        changed = new Emitter<void>();
    });

    afterEach(async () => {
        await React.act(async () => root.unmount());
        changed.dispose();
        clock.restore();
        disableReactActEnvironment();
        disableJSDOM();
    });

    it('shows the earliest pending approval for an unfocused session and updates when it is resolved', async () => {
        const first = new ToolCallChatResponseContentImpl('first', 'test', '{}');
        const second = new ToolCallChatResponseContentImpl('second', 'test', '{}');
        first.confirmationDeadline = Date.now() + 30_000;
        second.confirmationDeadline = Date.now() + 60_000;
        first.requestUserConfirmation();
        second.requestUserConfirmation();
        const session = {
            model: {
                status: 'awaitingApproval',
                getRequests: () => [{ response: { response: { content: [second, first] } } }],
                onDidChange: changed.event
            }
        } as unknown as ChatSession;
        clock.tick(10_000);
        await React.act(async () => root.render(<ChatSessionItem
            session={{ sessionId: 'background', title: 'Background chat', saveDate: 0, location: ChatAgentLocation.Panel }}
            isRestored={false}
            chatService={{ getSession: () => session } as unknown as ChatService}
            chatAgentService={{ getAgent: () => undefined } as unknown as ChatAgentService}
            hoverService={{} as HoverService}
            markdownRenderer={{} as MarkdownRenderer}
            unreadState={{ isUnread: () => false, onUnreadChanged: Event.None }}
            onClick={() => { }}
            formatTimeAgo={() => 'just now'}
        />));
        const countdown = () => container.querySelector('.theia-chat-session-item-status-icon .theia-tool-confirmation-countdown');
        expect(countdown()?.textContent).to.equal('0:20');
        expect(countdown()?.getAttribute('aria-label')).to.equal('Auto-cancels in 0:20');
        expect(container.querySelector('.theia-chat-session-item-status-icon .codicon-bell')).to.exist;
        expect(container.querySelector('.theia-chat-session-item-attention-dot')).to.exist;
        expect(container.querySelector('.theia-chat-session-item-content .theia-tool-confirmation-countdown')).not.to.exist;

        await React.act(async () => clock.tick(1000));
        expect(countdown()?.textContent).to.equal('0:19');

        first.confirm();
        await React.act(async () => changed.fire());
        expect(countdown()?.textContent).to.equal('0:49');

        second.deny();
        await React.act(async () => changed.fire());
        expect(container.querySelector('.theia-tool-confirmation-countdown')).not.to.exist;
    });
});
