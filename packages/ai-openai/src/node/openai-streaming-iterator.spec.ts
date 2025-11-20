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
import { StreamingAsyncIterator } from './openai-streaming-iterator';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { CancellationTokenSource, CancellationError } from '@theia/core';
import { LanguageModelStreamResponsePart, isTextResponsePart, isToolCallResponsePart } from '@theia/ai-core';
import { EventEmitter } from 'events';
import { ChatCompletionToolMessageParam } from 'openai/resources';

describe('StreamingAsyncIterator', () => {
    let mockStream: ChatCompletionStream & EventEmitter;
    let iterator: StreamingAsyncIterator;
    let cts: CancellationTokenSource;
    const consoleError = console.error;

    beforeEach(() => {
        mockStream = new EventEmitter() as ChatCompletionStream & EventEmitter;
        mockStream.abort = sinon.stub();

        cts = new CancellationTokenSource();
    });

    afterEach(() => {
        if (iterator) {
            iterator.dispose();
        }
        cts.dispose();
        console.error = consoleError;
    });

    function createIterator(withCancellationToken = false): StreamingAsyncIterator {
        return new StreamingAsyncIterator(mockStream, '', withCancellationToken ? cts.token : undefined);
    }

    it('should yield messages in the correct order when consumed immediately', async () => {
        iterator = createIterator();

        setTimeout(() => {
            mockStream.emit('chunk', { choices: [{ delta: { content: 'Hello' } }] });
            mockStream.emit('chunk', { choices: [{ delta: { content: ' ' } }] });
            mockStream.emit('chunk', { choices: [{ delta: { content: 'World' } }] });
            mockStream.emit('end');
        }, 10);

        const results: LanguageModelStreamResponsePart[] = [];

        while (true) {
            const { value, done } = await iterator.next();
            if (done) {
                break;
            }
            results.push(value);
        }

        expect(results).to.deep.equal([
            { content: 'Hello' },
            { content: ' ' },
            { content: 'World' }
        ]);
    });

    it('should buffer messages if consumer is slower (messages arrive before .next() is called)', async () => {
        iterator = createIterator();

        mockStream.emit('chunk', { choices: [{ delta: { content: 'A' } }] });
        mockStream.emit('chunk', { choices: [{ delta: { content: 'B' } }] });
        mockStream.emit('chunk', { choices: [{ delta: { content: 'C' } }] });
        mockStream.emit('end');

        const results: string[] = [];
        while (true) {
            const { value, done } = await iterator.next();
            if (done) {
                break;
            }
            results.push((isTextResponsePart(value) && value.content) || '');
        }

        expect(results).to.deep.equal(['A', 'B', 'C']);
    });

    it('should resolve queued next() call when a message arrives (consumer is waiting first)', async () => {
        iterator = createIterator();

        const nextPromise = iterator.next();

        setTimeout(() => {
            mockStream.emit('chunk', { choices: [{ delta: { content: 'Hello from queue' } }] });
            mockStream.emit('end');
        }, 10);

        const first = await nextPromise;
        expect(first.done).to.be.false;
        expect(first.value.content).to.equal('Hello from queue');

        const second = await iterator.next();
        expect(second.done).to.be.true;
        expect(second.value).to.be.undefined;
    });

    it('should handle the end event correctly', async () => {
        iterator = createIterator();

        mockStream.emit('chunk', { choices: [{ delta: { content: 'EndTest1' } }] });
        mockStream.emit('chunk', { choices: [{ delta: { content: 'EndTest2' } }] });
        mockStream.emit('end');

        const results: string[] = [];
        while (true) {
            const { value, done } = await iterator.next();
            if (done) {
                break;
            }
            results.push((isTextResponsePart(value) && value.content) || '');
        }

        expect(results).to.deep.equal(['EndTest1', 'EndTest2']);
    });

    it('should reject pending .next() call with an error if error event occurs', async () => {
        iterator = createIterator();

        const pendingNext = iterator.next();

        // Suppress console.error output
        console.error = () => { };

        const error = new Error('Stream error occurred');
        mockStream.emit('error', error);

        try {
            await pendingNext;
            expect.fail('The promise should have been rejected with an error.');
        } catch (err) {
            expect(err).to.equal(error);
        }
    });

    it('should reject pending .next() call with a CancellationError if "abort" event occurs', async () => {
        iterator = createIterator();

        const pendingNext = iterator.next();

        // Suppress console.error output
        console.error = () => { };

        mockStream.emit('abort');

        try {
            await pendingNext;
            expect.fail('The promise should have been rejected with a CancellationError.');
        } catch (err) {
            expect(err).to.be.instanceOf(CancellationError);
        }
    });

    it('should call stream.abort() when cancellation token is triggered', async () => {
        iterator = createIterator(true);

        cts.cancel();

        sinon.assert.calledOnce(mockStream.abort as sinon.SinonSpy);
    });

    it('should not lose unconsumed messages after disposal, but no new ones arrive', async () => {
        iterator = createIterator();

        mockStream.emit('chunk', { choices: [{ delta: { content: 'Msg1' } }] });
        mockStream.emit('chunk', { choices: [{ delta: { content: 'Msg2' } }] });

        iterator.dispose();

        let result = await iterator.next();
        expect(result.done).to.be.false;
        expect(result.value.content).to.equal('Msg1');

        result = await iterator.next();
        expect(result.done).to.be.false;
        expect(result.value.content).to.equal('Msg2');

        result = await iterator.next();
        expect(result.done).to.be.true;
        expect(result.value).to.be.undefined;
    });

    it('should reject all pending requests with an error if disposal occurs after stream error', async () => {
        iterator = createIterator();

        const pendingNext1 = iterator.next();
        const pendingNext2 = iterator.next();

        // Suppress console.error output
        console.error = () => { };

        const error = new Error('Critical error');
        mockStream.emit('error', error);

        try {
            await pendingNext1;
            expect.fail('expected to be rejected');
        } catch (err) {
            expect(err).to.equal(error);
        }

        try {
            await pendingNext2;
            expect.fail('expected to be rejected');
        } catch (err) {
            expect(err).to.equal(error);
        }
    });

    it('should handle receiving a "message" event with role="tool"', async () => {
        iterator = createIterator();

        setTimeout(() => {
            mockStream.emit('message', {
                role: 'tool',
                tool_call_id: 'tool-123',
                content: [{ type: 'text', text: 'Part1' }, { type: 'text', text: 'Part2' }]
            } satisfies ChatCompletionToolMessageParam);
            mockStream.emit('end');
        }, 10);

        const results: LanguageModelStreamResponsePart[] = [];
        for await (const part of iterator) {
            results.push(part);
        }

        expect(results).to.have.lengthOf(1);
        expect(isToolCallResponsePart(results[0]) && results[0].tool_calls).to.deep.equal([
            {
                id: 'tool-123',
                finished: true,
                result: { content: [{ type: 'text', text: 'Part1' }, { type: 'text', text: 'Part2' }] }
            }
        ]);
    });
});
