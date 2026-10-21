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
import * as sinon from 'sinon';
import { ContextMenuRenderer, OpenerService } from '@theia/core/lib/browser';
import { ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { ToolConfirmationMode as ToolConfirmationPreferenceMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot } from '@theia/core/shared/react-dom/client';
import * as React from '@theia/core/shared/react';
import {
    ConfirmationScope,
    CountdownTimer,
    CountdownTimerProps,
    ToolConfirmationCallbacks,
    ToolConfirmationActionsProps,
    ToolConfirmationProps,
    withToolCallConfirmation
} from './tool-confirmation';

const mockContextMenuRenderer = {} as ContextMenuRenderer;
const mockOpenerService = {} as OpenerService;

disableJSDOM();

describe('Tool Confirmation Types', () => {
    describe('ConfirmationScope', () => {
        it('should accept valid scopes', () => {
            const scopes: ConfirmationScope[] = ['once', 'session', 'forever'];
            expect(scopes).to.have.length(3);
        });
    });

    describe('ToolConfirmationCallbacks', () => {
        it('should define required callback properties', () => {
            const callbacks: ToolConfirmationCallbacks = {
                onAllow: (_scope: ConfirmationScope) => { },
                onDeny: (_scope: ConfirmationScope, _reason?: string) => { }
            };
            expect(callbacks.onAllow).to.be.a('function');
            expect(callbacks.onDeny).to.be.a('function');
        });

        it('should allow optional toolRequest', () => {
            const callbacks: ToolConfirmationCallbacks = {
                toolRequest: { id: 'test', name: 'test', handler: async () => '', parameters: { type: 'object', properties: {} } },
                onAllow: () => { },
                onDeny: () => { }
            };
            expect(callbacks.toolRequest).to.exist;
        });
    });

    describe('ToolConfirmationActionsProps', () => {
        it('should extend ToolConfirmationCallbacks with toolName', () => {
            const props: ToolConfirmationActionsProps = {
                toolName: 'testTool',
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer
            };
            expect(props.toolName).to.equal('testTool');
        });

        it('should support confirmAlwaysAllow string in toolRequest', () => {
            const props: ToolConfirmationActionsProps = {
                toolName: 'dangerousTool',
                toolRequest: {
                    id: 'test',
                    name: 'test',
                    handler: async () => '',
                    parameters: { type: 'object', properties: {} },
                    confirmAlwaysAllow: 'This tool can modify system files.'
                },
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer
            };
            expect(props.toolRequest?.confirmAlwaysAllow).to.equal('This tool can modify system files.');
        });

        it('should support confirmAlwaysAllow boolean in toolRequest', () => {
            const props: ToolConfirmationActionsProps = {
                toolName: 'dangerousTool',
                toolRequest: {
                    id: 'test',
                    name: 'test',
                    handler: async () => '',
                    parameters: { type: 'object', properties: {} },
                    confirmAlwaysAllow: true
                },
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer
            };
            expect(props.toolRequest?.confirmAlwaysAllow).to.be.true;
        });
    });

    describe('CountdownTimerProps', () => {
        it('should accept a response with confirmationTimeout', () => {
            const response = { kind: 'toolCall', confirmationTimeout: 30 } as ToolCallChatResponseContent;
            const props: CountdownTimerProps = { response };
            expect(props.response.confirmationTimeout).to.equal(30);
        });

        it('should accept a response without confirmationTimeout', () => {
            const response = { kind: 'toolCall' } as ToolCallChatResponseContent;
            const props: CountdownTimerProps = { response };
            expect(props.response.confirmationTimeout).to.be.undefined;
        });
    });

    describe('CountdownTimer', () => {
        let clock: sinon.SinonFakeTimers;
        let container: HTMLDivElement;
        let root: ReturnType<typeof createRoot>;

        beforeEach(() => {
            disableJSDOM = enableJSDOM();
            clock = sinon.useFakeTimers();
            container = document.createElement('div');
            root = createRoot(container);
        });

        afterEach(async () => {
            await React.act(async () => root.unmount());
            clock.restore();
            disableJSDOM();
        });

        it('shows elapsed background time on mount and continues from the same deadline after remount', () => {
            const response = { confirmationTimeout: 30, confirmationDeadline: Date.now() + 30_000 } as ToolCallChatResponseContent;
            clock.tick(10_000);
            flushSync(() => root.render(React.createElement(CountdownTimer, { response })));
            expect(container.textContent).to.equal('Auto-cancels in 0:20');

            flushSync(() => clock.tick(3000));
            expect(container.textContent).to.equal('Auto-cancels in 0:17');
            flushSync(() => root.unmount());
            clock.tick(5000);
            root = createRoot(container);
            flushSync(() => root.render(React.createElement(CountdownTimer, { response })));
            expect(container.textContent).to.equal('Auto-cancels in 0:12');
        });

        it('renders a compact time with the full accessible label', () => {
            const response = { confirmationDeadline: Date.now() + 65_000 } as ToolCallChatResponseContent;
            flushSync(() => root.render(React.createElement(CountdownTimer, { response, compact: true })));
            const countdown = container.querySelector('span.theia-tool-confirmation-countdown');
            expect(countdown?.textContent).to.equal('1:05');
            expect(countdown?.getAttribute('title')).to.equal('Auto-cancels in 1:05');
            expect(countdown?.getAttribute('aria-label')).to.equal('Auto-cancels in 1:05');
        });

        it('does not show a countdown without an active deadline', () => {
            const response = { confirmationTimeout: 30 } as ToolCallChatResponseContent;
            flushSync(() => root.render(React.createElement(CountdownTimer, { response })));
            expect(container.textContent).to.equal('');
        });

        it('hides expired countdowns', () => {
            const response = { confirmationDeadline: Date.now() + 1000 } as ToolCallChatResponseContent;
            flushSync(() => root.render(React.createElement(CountdownTimer, { response })));
            flushSync(() => clock.tick(1000));
            expect(container.textContent).to.equal('');
        });
    });

    describe('withToolCallConfirmation', () => {
        before(() => {
            disableJSDOM = enableJSDOM();
        });

        after(() => {
            disableJSDOM();
        });

        it('should pass opener service through to the wrapped component', () => {
            const Wrapped: React.FC<{ openerService: OpenerService }> = ({ openerService }) =>
                React.createElement('span', undefined, openerService === mockOpenerService ? 'passed' : 'missing');
            const WrappedWithConfirmation = withToolCallConfirmation(Wrapped);
            const container = document.createElement('div');
            const root = createRoot(container);
            const response = {
                kind: 'toolCall',
                id: 'test',
                name: 'test',
                finished: true,
                confirmed: Promise.resolve(true),
                needsUserConfirmation: Promise.resolve(),
                confirm: () => { },
                deny: () => { }
            } as ToolCallChatResponseContent;

            flushSync(() => root.render(React.createElement(WrappedWithConfirmation, {
                openerService: mockOpenerService,
                toolConfirmation: {
                    response,
                    confirmationMode: ToolConfirmationPreferenceMode.CONFIRM,
                    toolConfirmationManager: {} as ToolConfirmationManager,
                    chatId: 'test-chat',
                    requestCanceled: false,
                    contextMenuRenderer: mockContextMenuRenderer,
                    openerService: mockOpenerService
                }
            })));

            expect(container.textContent).to.equal('passed');
            root.unmount();
        });
    });

    describe('ToolConfirmationProps', () => {
        it('should pick toolRequest from ToolConfirmationCallbacks', () => {
            const props: ToolConfirmationProps = {
                response: { kind: 'toolCall', id: 'test', name: 'test' } as ToolConfirmationProps['response'],
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer,
                openerService: mockOpenerService
            };
            expect(props.toolRequest).to.be.undefined;
        });

        it('should accept response arguments with an opener service', () => {
            const props: ToolConfirmationProps = {
                response: { kind: 'toolCall', id: 'test', name: 'test', arguments: '{"foo":"bar"}' } as ToolConfirmationProps['response'],
                onAllow: () => { },
                onDeny: () => { },
                contextMenuRenderer: mockContextMenuRenderer,
                openerService: mockOpenerService
            };
            expect(props.response.arguments).to.equal('{"foo":"bar"}');
            expect(props.openerService).to.equal(mockOpenerService);
        });
    });
});
