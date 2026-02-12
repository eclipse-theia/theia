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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { ToolCallChatResponseContentImpl } from './chat-model';

describe('ToolCallChatResponseContentImpl', () => {
    let consoleWarnStub: sinon.SinonStub;

    beforeEach(() => {
        consoleWarnStub = sinon.stub(console, 'warn');
    });

    afterEach(() => {
        consoleWarnStub.restore();
    });

    describe('toLanguageModelMessage', () => {
        it('should parse valid JSON arguments', () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{"key": "value", "number": 42}',
                true
            );

            const [toolUseMessage] = toolCall.toLanguageModelMessage();

            expect(toolUseMessage.input).to.deep.equal({ key: 'value', number: 42 });
            expect(consoleWarnStub.called).to.be.false;
        });

        it('should return empty object for malformed JSON and log warning', () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{"truncated": "json',
                true
            );

            const [toolUseMessage] = toolCall.toLanguageModelMessage();

            expect(toolUseMessage.input).to.deep.equal({});
            expect(consoleWarnStub.calledOnce).to.be.true;
            expect(consoleWarnStub.firstCall.args[0]).to.include('Failed to parse tool call arguments');
            expect(consoleWarnStub.firstCall.args[0]).to.include('test-tool');
        });

        it('should return empty object for empty arguments', () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '',
                true
            );

            const [toolUseMessage] = toolCall.toLanguageModelMessage();

            expect(toolUseMessage.input).to.deep.equal({});
            expect(consoleWarnStub.called).to.be.false;
        });

        it('should return empty object for undefined arguments', () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                undefined,
                true
            );

            const [toolUseMessage] = toolCall.toLanguageModelMessage();

            expect(toolUseMessage.input).to.deep.equal({});
            expect(consoleWarnStub.called).to.be.false;
        });

        it('should handle mid-stream cancellation with truncated JSON', () => {
            // Simulates a cancelled stream that left truncated JSON
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'cancelledTool',
                '{"file": "/path/to/file.ts", "content": "partial content...',
                false // not finished
            );

            const [toolUseMessage] = toolCall.toLanguageModelMessage();

            expect(toolUseMessage.input).to.deep.equal({});
            expect(consoleWarnStub.calledOnce).to.be.true;
            expect(consoleWarnStub.firstCall.args[0]).to.include('cancelledTool');
        });

        it('should parse complex nested JSON arguments', () => {
            const complexArgs = JSON.stringify({
                nested: { deep: { value: 123 } },
                array: [1, 2, 3],
                boolean: true
            });

            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                complexArgs,
                true
            );

            const [toolUseMessage] = toolCall.toLanguageModelMessage();

            expect(toolUseMessage.input).to.deep.equal({
                nested: { deep: { value: 123 } },
                array: [1, 2, 3],
                boolean: true
            });
            expect(consoleWarnStub.called).to.be.false;
        });

        it('should include tool result in the result message', () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{}',
                true,
                'Tool execution result'
            );

            const [, toolResultMessage] = toolCall.toLanguageModelMessage();

            expect(toolResultMessage.content).to.equal('Tool execution result');
            expect(toolResultMessage.tool_use_id).to.equal('test-id');
        });
    });

    describe('restored tool calls', () => {
        it('should have finished=true when restored with a result', () => {
            const restoredToolCall = new ToolCallChatResponseContentImpl(
                'restored-id',
                'shellExecute',
                '{"command": "ls -la"}',
                true,
                '{"success": true, "output": "file1.txt\\nfile2.txt"}'
            );

            expect(restoredToolCall.finished).to.be.true;
            expect(restoredToolCall.result).to.exist;
        });
    });

    describe('whenFinished', () => {
        it('should resolve immediately when constructed with finished=true', async () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{}',
                true
            );

            await toolCall.whenFinished;
            expect(toolCall.finished).to.be.true;
        });

        it('should resolve when deny is called', async () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{}'
            );

            expect(toolCall.finished).to.be.false;

            const finishedPromise = toolCall.whenFinished;
            toolCall.deny('test reason');

            await finishedPromise;
            expect(toolCall.finished).to.be.true;
        });

        it('should resolve when merged with finished content', async () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{}'
            );

            expect(toolCall.finished).to.be.false;

            const finishedPromise = toolCall.whenFinished;
            const finishedContent = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{}',
                true,
                'result'
            );
            toolCall.merge(finishedContent);

            await finishedPromise;
            expect(toolCall.finished).to.be.true;
        });

        it('should resolve when complete is called', async () => {
            const toolCall = new ToolCallChatResponseContentImpl(
                'test-id',
                'test-tool',
                '{}'
            );

            expect(toolCall.finished).to.be.false;

            const finishedPromise = toolCall.whenFinished;
            toolCall.complete('execution result');

            await finishedPromise;
            expect(toolCall.finished).to.be.true;
            expect(toolCall.result).to.equal('execution result');
        });
    });
});
