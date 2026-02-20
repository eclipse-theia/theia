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
import { Emitter, Event } from '@theia/core';
import { ChatModel, ChatRequestModel, ResponseTokenUsage } from '@theia/ai-chat';
import {
    ChatTokenUsageIndicator,
    computeSessionTokenUsage,
    formatTokenCount,
    getUsageColorClass
} from './chat-token-usage-indicator';

const CHAT_CONTEXT_WINDOW_SIZE = 200000;
const CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD = 180000;

disableJSDOM();

function createMockRequest(tokenUsage?: ResponseTokenUsage): Partial<ChatRequestModel> {
    return {
        response: {
            tokenUsage
        } as ChatRequestModel['response']
    };
}

function createMockChatModel(requests: Partial<ChatRequestModel>[]): ChatModel {
    const emitter = new Emitter<unknown>();
    return {
        onDidChange: emitter.event as Event<unknown>,
        id: 'test-model',
        getRequests: () => requests as ChatRequestModel[],
    } as ChatModel;
}

describe('ChatTokenUsageIndicator', () => {
    let container: HTMLElement;
    let root: Root;

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
    });

    afterEach(() => {
        root.unmount();
        container.remove();
    });

    describe('formatTokenCount', () => {
        it('should return "-" for undefined', () => {
            expect(formatTokenCount(undefined)).to.equal('-');
        });

        it('should return "-" for 0', () => {
            expect(formatTokenCount(0)).to.equal('-');
        });

        it('should format numbers below 1000 as-is', () => {
            expect(formatTokenCount(500)).to.equal('500');
            expect(formatTokenCount(999)).to.equal('999');
        });

        it('should format numbers >= 1000 with k suffix and one decimal', () => {
            expect(formatTokenCount(1000)).to.equal('1.0k');
            expect(formatTokenCount(1500)).to.equal('1.5k');
            expect(formatTokenCount(125000)).to.equal('125.0k');
            expect(formatTokenCount(200000)).to.equal('200.0k');
        });
    });

    describe('getUsageColorClass', () => {
        it('should return none for 0 tokens', () => {
            expect(getUsageColorClass(0)).to.equal('token-usage-none');
        });

        it('should return green for tokens below threshold', () => {
            expect(getUsageColorClass(1)).to.equal('token-usage-green');
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD - 1)).to.equal('token-usage-green');
        });

        it('should return yellow for tokens at or above threshold but below budget', () => {
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_WARNING_THRESHOLD)).to.equal('token-usage-yellow');
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_SIZE - 1)).to.equal('token-usage-yellow');
        });

        it('should return red for tokens at or above budget', () => {
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_SIZE)).to.equal('token-usage-red');
            expect(getUsageColorClass(CHAT_CONTEXT_WINDOW_SIZE + 1)).to.equal('token-usage-red');
        });
    });

    describe('computeSessionTokenUsage', () => {
        it('should return 0 when chatModel is undefined', () => {
            expect(computeSessionTokenUsage(undefined)).to.equal(0);
        });

        it('should return 0 when there are no requests', () => {
            const model = createMockChatModel([]);
            expect(computeSessionTokenUsage(model)).to.equal(0);
        });

        it('should return 0 when requests have no token usage', () => {
            const model = createMockChatModel([
                createMockRequest(undefined),
                createMockRequest(undefined)
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(0);
        });

        it('should sum input and output tokens from a single request', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 })
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(1500);
        });

        it('should accumulate tokens across multiple requests', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 }),
                createMockRequest({ inputTokens: 2000, outputTokens: 800 })
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(4300);
        });

        it('should include cache creation and cache read tokens', () => {
            const model = createMockChatModel([
                createMockRequest({
                    inputTokens: 1000,
                    outputTokens: 500,
                    cacheCreationInputTokens: 200,
                    cacheReadInputTokens: 300
                })
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(2000);
        });

        it('should handle mixed requests with and without token usage', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 1000, outputTokens: 500 }),
                createMockRequest(undefined),
                createMockRequest({ inputTokens: 3000, outputTokens: 1000 })
            ]);
            expect(computeSessionTokenUsage(model)).to.equal(5500);
        });
    });

    describe('component rendering', () => {
        it('should render with no chatModel', () => {
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        chatModel: undefined
                    })
                );
            });
            const label = container.querySelector('.token-usage-label');
            expect(label).to.exist;
            expect(label?.textContent).to.contain('- / 200.0k');
        });

        it('should render accumulated tokens from chatModel', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 50000, outputTokens: 75000 })
            ]);
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        chatModel: model
                    })
                );
            });
            const label = container.querySelector('.token-usage-label');
            expect(label).to.exist;
            // 50000 + 75000 = 125000 => '125.0k'
            expect(label?.textContent).to.contain('125.0k');
        });

        it('should accumulate tokens across multiple requests', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 10000, outputTokens: 5000 }),
                createMockRequest({ inputTokens: 20000, outputTokens: 15000 })
            ]);
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        chatModel: model
                    })
                );
            });
            const label = container.querySelector('.token-usage-label');
            // 10000 + 5000 + 20000 + 15000 = 50000 => '50.0k'
            expect(label?.textContent).to.contain('50.0k');
        });

        it('should apply correct color class based on token total', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 100, outputTokens: 100 })
            ]);
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        chatModel: model
                    })
                );
            });
            const bar = container.querySelector('.token-usage-bar');
            // 200 total => green
            expect(bar?.classList.contains('token-usage-green')).to.equal(true);
        });

        it('should apply yellow class when above threshold', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 100000, outputTokens: 90000 })
            ]);
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        chatModel: model
                    })
                );
            });
            const bar = container.querySelector('.token-usage-bar');
            // 190000 total => yellow
            expect(bar?.classList.contains('token-usage-yellow')).to.equal(true);
        });

        it('should apply red class when at or above budget', () => {
            const model = createMockChatModel([
                createMockRequest({ inputTokens: 100000, outputTokens: 100000 })
            ]);
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        chatModel: model
                    })
                );
            });
            const bar = container.querySelector('.token-usage-bar');
            // 200000 total => red
            expect(bar?.classList.contains('token-usage-red')).to.equal(true);
        });

        it('should include cache tokens in the displayed total', () => {
            const model = createMockChatModel([
                createMockRequest({
                    inputTokens: 1000,
                    outputTokens: 100,
                    cacheCreationInputTokens: 500,
                    cacheReadInputTokens: 2000
                })
            ]);
            flushSync(() => {
                root.render(
                    React.createElement(ChatTokenUsageIndicator, {
                        chatModel: model
                    })
                );
            });
            const label = container.querySelector('.token-usage-label');
            // 1000 + 100 + 500 + 2000 = 3600 => '3.6k'
            expect(label?.textContent).to.contain('3.6k');
        });
    });
});
