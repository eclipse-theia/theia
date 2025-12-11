// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import * as ReactDOMClient from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { Emitter } from '@theia/core';
import {
    ChatSessionTokenTracker,
    SessionTokenThresholdEvent,
    SessionTokenUpdateEvent,
    CHAT_TOKEN_THRESHOLD
} from '@theia/ai-chat/lib/browser';
import { ChatTokenUsageIndicator, ChatTokenUsageIndicatorProps } from './chat-token-usage-indicator';

disableJSDOM();

describe('ChatTokenUsageIndicator', () => {
    let container: HTMLDivElement;
    let root: ReactDOMClient.Root;

    const createMockTokenTracker = (tokens: number | undefined): ChatSessionTokenTracker => {
        const thresholdEmitter = new Emitter<SessionTokenThresholdEvent>();
        const updateEmitter = new Emitter<SessionTokenUpdateEvent>();
        return {
            onThresholdExceeded: thresholdEmitter.event,
            onSessionTokensUpdated: updateEmitter.event,
            getSessionInputTokens: () => tokens,
            resetSessionTokens: () => { },
            resetThresholdTrigger: () => { }
        };
    };

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = ReactDOMClient.createRoot(container);
    });

    afterEach(() => {
        flushSync(() => {
            root.unmount();
        });
        container.remove();
    });

    const renderComponent = (props: ChatTokenUsageIndicatorProps): void => {
        flushSync(() => {
            root.render(React.createElement(ChatTokenUsageIndicator, props));
        });
    };

    describe('token formatting', () => {
        it('should display "-" when no tokens are tracked', () => {
            const mockTracker = createMockTokenTracker(undefined);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const textContent = container.textContent;
            expect(textContent).to.contain('-');
        });

        it('should format small token counts as plain numbers', () => {
            const mockTracker = createMockTokenTracker(500);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const textContent = container.textContent;
            expect(textContent).to.contain('500');
        });

        it('should format large token counts with "k" suffix', () => {
            const mockTracker = createMockTokenTracker(125000);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const textContent = container.textContent;
            expect(textContent).to.contain('125k');
        });

        it('should format token counts with decimal "k" suffix when needed', () => {
            const mockTracker = createMockTokenTracker(1500);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const textContent = container.textContent;
            expect(textContent).to.contain('1.5k');
        });
    });

    describe('color coding', () => {
        it('should have green class when usage is below 70%', () => {
            // 70% of CHAT_TOKEN_THRESHOLD = 126000, so 100000 is below
            expect(Math.round(CHAT_TOKEN_THRESHOLD * 0.7)).to.equal(126000);
            const mockTracker = createMockTokenTracker(100000);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            expect(indicator?.classList.contains('token-usage-green')).to.be.true;
        });

        it('should have yellow class when usage is between 70% and 90%', () => {
            // 70% of CHAT_TOKEN_THRESHOLD = 126000
            // 90% of CHAT_TOKEN_THRESHOLD = 162000
            const mockTracker = createMockTokenTracker(150000);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            expect(indicator?.classList.contains('token-usage-yellow')).to.be.true;
        });

        it('should have red class when usage is at or above 90%', () => {
            // 90% of CHAT_TOKEN_THRESHOLD = 162000
            const mockTracker = createMockTokenTracker(170000);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            expect(indicator?.classList.contains('token-usage-red')).to.be.true;
        });

        it('should have none class when no tokens are tracked', () => {
            const mockTracker = createMockTokenTracker(undefined);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            expect(indicator?.classList.contains('token-usage-none')).to.be.true;
        });
    });

    describe('tooltip', () => {
        it('should include budget-aware status in tooltip when enabled', () => {
            const mockTracker = createMockTokenTracker(100000);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            const title = indicator?.getAttribute('title');
            expect(title).to.include('Budget-aware: Enabled');
        });

        it('should include budget-aware status in tooltip when disabled', () => {
            const mockTracker = createMockTokenTracker(100000);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: false
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            const title = indicator?.getAttribute('title');
            expect(title).to.include('Budget-aware: Disabled');
        });

        it('should include threshold and budget values in tooltip', () => {
            const mockTracker = createMockTokenTracker(100000);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            const title = indicator?.getAttribute('title');
            expect(title).to.include('Threshold:');
            expect(title).to.include('Budget:');
        });

        it('should show "None" in tooltip when no tokens tracked', () => {
            const mockTracker = createMockTokenTracker(undefined);
            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            const title = indicator?.getAttribute('title');
            expect(title).to.include('Tokens: None');
        });
    });

    describe('subscription to token updates', () => {
        it('should update when token tracker fires update event', () => {
            const updateEmitter = new Emitter<SessionTokenUpdateEvent>();
            const thresholdEmitter = new Emitter<SessionTokenThresholdEvent>();
            let currentTokens = 50000;

            const mockTracker: ChatSessionTokenTracker = {
                onThresholdExceeded: thresholdEmitter.event,
                onSessionTokensUpdated: updateEmitter.event,
                getSessionInputTokens: () => currentTokens,
                resetSessionTokens: () => { },
                resetThresholdTrigger: () => { }
            };

            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            // Initial state
            let textContent = container.textContent;
            expect(textContent).to.contain('50k');

            // Fire update event within flushSync to ensure synchronous React update
            currentTokens = 100000;
            flushSync(() => {
                updateEmitter.fire({ sessionId: 'test-session', inputTokens: 100000 });
            });

            textContent = container.textContent;
            expect(textContent).to.contain('100k');
        });

        it('should not update when event is for different session', () => {
            const updateEmitter = new Emitter<SessionTokenUpdateEvent>();
            const thresholdEmitter = new Emitter<SessionTokenThresholdEvent>();

            const mockTracker: ChatSessionTokenTracker = {
                onThresholdExceeded: thresholdEmitter.event,
                onSessionTokensUpdated: updateEmitter.event,
                getSessionInputTokens: () => 50000,
                resetSessionTokens: () => { },
                resetThresholdTrigger: () => { }
            };

            renderComponent({
                sessionId: 'test-session',
                tokenTracker: mockTracker,
                budgetAwareEnabled: true
            });

            // Initial state
            let textContent = container.textContent;
            expect(textContent).to.contain('50k');

            // Fire update event for different session within flushSync
            flushSync(() => {
                updateEmitter.fire({ sessionId: 'other-session', inputTokens: 100000 });
            });

            textContent = container.textContent;
            // Should still show 50k since we didn't update our session
            expect(textContent).to.contain('50k');
        });
    });
});
