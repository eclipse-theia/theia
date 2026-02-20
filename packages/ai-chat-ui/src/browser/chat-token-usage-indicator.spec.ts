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

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Emitter } from '@theia/core';
import { TokenUsage } from '@theia/ai-core/lib/common/token-usage-service';
import { TokenUsageServiceClient } from '@theia/ai-core/lib/common/protocol';
import { ChatTokenUsageIndicator, formatTokenCount, getUsageColorClass } from './chat-token-usage-indicator';

const CHAT_TOKEN_BUDGET = 200000;
const CHAT_TOKEN_THRESHOLD = 180000;

disableJSDOM();

describe('ChatTokenUsageIndicator', () => {
    let container: HTMLElement;
    let root: Root;
    let emitter: Emitter<TokenUsage>;
    let mockClient: TokenUsageServiceClient;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        emitter = new Emitter<TokenUsage>();

        mockClient = {
            onTokenUsageUpdated: emitter.event,
            notifyTokenUsage: () => { }
        };
    });

    afterEach(() => {
        root.unmount();
        container.remove();
        emitter.dispose();
    });

    describe('formatTokenCount', () => {
        it('should return "-" for undefined', () => {
            expect(formatTokenCount(undefined)).to.equal('-');
        });

        it('should format numbers below 1000 as-is', () => {
            expect(formatTokenCount(0)).to.equal('-');
            expect(formatTokenCount(500)).to.equal('500');
            expect(formatTokenCount(999)).to.equal('999');
        });

        it('should format numbers >= 1000 with k suffix', () => {
            expect(formatTokenCount(1000)).to.equal('1k');
            expect(formatTokenCount(1500)).to.equal('2k');
            expect(formatTokenCount(125000)).to.equal('125k');
            expect(formatTokenCount(200000)).to.equal('200k');
        });
    });

    describe('getUsageColorClass', () => {
        it('should return none for undefined', () => {
            expect(getUsageColorClass(undefined)).to.equal('token-usage-none');
        });

        it('should return none for 0 tokens', () => {
            expect(getUsageColorClass(0)).to.equal('token-usage-none');
        });

        it('should return green for tokens below threshold', () => {
            expect(getUsageColorClass(1)).to.equal('token-usage-green');
            expect(getUsageColorClass(CHAT_TOKEN_THRESHOLD - 1)).to.equal('token-usage-green');
        });

        it('should return yellow for tokens at or above threshold but below budget', () => {
            expect(getUsageColorClass(CHAT_TOKEN_THRESHOLD)).to.equal('token-usage-yellow');
            expect(getUsageColorClass(CHAT_TOKEN_BUDGET - 1)).to.equal('token-usage-yellow');
        });

        it('should return red for tokens at or above budget', () => {
            expect(getUsageColorClass(CHAT_TOKEN_BUDGET)).to.equal('token-usage-red');
            expect(getUsageColorClass(CHAT_TOKEN_BUDGET + 1)).to.equal('token-usage-red');
        });
    });

    describe('component rendering', () => {
        it('should render with correct token counts after events', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 50000,
                    outputTokens: 75000,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            expect(indicator).to.exist;
            // 50000 input + 75000 output = 125000 => '125k'
            expect(indicator?.textContent).to.contain('125k');
            expect(indicator?.textContent).to.contain('200k');
        });

        it('should show tooltip with token details', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 50000,
                    outputTokens: 75000,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            const title = indicator?.getAttribute('title') ?? '';
            // 50000 input + 75000 output = 125000
            expect(title).to.contain(`Total tokens (input + output): ${(125000).toLocaleString()}`);
        });

        it('should apply correct color class', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 100,
                    outputTokens: 100,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            // 100 input + 100 output = 200, still green
            expect(indicator?.classList.contains('token-usage-green')).to.equal(true);
        });

        it('should update when token event fires', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            let indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            expect(indicator?.classList.contains('token-usage-none')).to.equal(true);

            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 100000,
                    outputTokens: 50000,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });

            indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            // 100000 input + 50000 output = 150000 => '150k'
            expect(indicator?.textContent).to.contain('150k');
        });

        it('should not update for events from different sessions', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 1000,
                    outputTokens: 1000,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });

            flushSync(() => {
                emitter.fire({
                    sessionId: 'other-session',
                    inputTokens: 999000,
                    outputTokens: 999000,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-2'
                });
            });

            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            // 1000 input + 1000 output = 2000 => '2k' (from first session event)
            expect(indicator?.textContent).to.contain('2k');
        });

        it('should show "0" when zero tokens are tracked', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            expect(indicator?.textContent).to.contain('- / 200k tokens');
        });

        it('should show latest token count from multiple events', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 1000,
                    outputTokens: 500,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 2000,
                    outputTokens: 1000,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-2'
                });
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            // 2000 input + 1000 output = 3000 => '3k'
            expect(indicator?.textContent).to.contain('3k');
        });

        it('should show "Tokens: None" in tooltip when zero tokens tracked', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            const title = indicator?.getAttribute('title') ?? '';
            expect(title).to.contain('Total tokens (input + output): None');
        });

        it('should include cached input tokens in latest count', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 1000,
                    cachedInputTokens: 500,
                    readCachedInputTokens: 2000,
                    outputTokens: 100,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            // 1000 + 500 + 2000 + 100 = 3600 => '4k' (rounded)
            expect(indicator?.textContent).to.contain('4k');
        });

        it('should include output tokens in the displayed total', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            flushSync(() => {
                emitter.fire({
                    sessionId: 'test-session',
                    inputTokens: 5000,
                    outputTokens: 1000,
                    model: 'test-model',
                    timestamp: new Date(),
                    requestId: 'req-1'
                });
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            // 5000 input + 1000 output = 6000 => '6k'
            expect(indicator?.textContent).to.contain('6k');
        });

        it('should include Threshold and Budget values in tooltip', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        sessionId: 'test-session',
                        tokenUsageClient: mockClient
                    })
                );
            });
            const indicator = container.querySelector('.theia-ChatTokenUsageIndicator');
            const title = indicator?.getAttribute('title') ?? '';
            expect(title).to.contain(`Threshold: ${CHAT_TOKEN_THRESHOLD.toLocaleString()}`);
            expect(title).to.contain(`Budget: ${CHAT_TOKEN_BUDGET.toLocaleString()}`);
        });
    });
});
