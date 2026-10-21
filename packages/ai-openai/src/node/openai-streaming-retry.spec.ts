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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { CancellationError, CancellationToken, CancellationTokenSource } from '@theia/core';
import { retryOpenAiStream } from './openai-streaming-retry';

async function* events(...values: unknown[]): AsyncIterable<unknown> {
    yield* values;
}

async function collect(stream: AsyncIterable<unknown>): Promise<{ values: unknown[]; error?: unknown }> {
    const values: unknown[] = [];
    try {
        for await (const value of stream) {
            values.push(value);
        }
        return { values };
    } catch (error) {
        return { values, error };
    }
}

const busy = { type: 'response.failed', response: { error: { code: 'server_error', message: 'The server is too busy.' } } };
const lifecycle = { type: 'response.created' };
const output = { type: 'response.output_text.delta', delta: 'answer' };

describe('retryOpenAiStream', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
    });
    afterEach(() => sinon.restore());

    it('retries a busy failure after lifecycle events without exposing the failure', async () => {
        const open = sinon.stub();
        open.onFirstCall().resolves(events(lifecycle, busy));
        open.onSecondCall().resolves(events(lifecycle, output));
        const result = collect(retryOpenAiStream(open, 3, event => event === lifecycle));
        await clock.tickAsync(374);
        expect(open.callCount).to.equal(1);
        await clock.tickAsync(126);
        expect(await result).to.deep.equal({ values: [lifecycle, lifecycle, output] });
        expect(open.callCount).to.equal(2);
    });

    for (const maxRetries of [0, 1, 3]) {
        it(`stops after ${maxRetries} retries and preserves the provider error`, async () => {
            const open = sinon.stub().callsFake(async () => events(busy));
            const result = collect(retryOpenAiStream(open, maxRetries, () => true));
            await clock.runAllAsync();
            const { error, values } = await result;
            expect(values).to.be.empty;
            expect(error).to.be.instanceOf(Error).with.property('message', busy.response.error.message);
            expect(error).to.have.property('code', 'server_error');
            expect(open.callCount).to.equal(maxRetries + 1);
        });
    }

    for (const event of [output, { type: 'response.reasoning_summary_text.delta', delta: 'thinking' },
        { type: 'response.output_item.added', item: { type: 'function_call' } },
        { type: 'response.output_item.added', item: { type: 'web_search_call' } }]) {
        it(`does not replay a response after ${JSON.stringify(event)}`, async () => {
            const open = sinon.stub().callsFake(async () => events(lifecycle, event, busy));
            const result = await collect(retryOpenAiStream(open, 3, value => value === lifecycle));
            expect(result.values).to.deep.equal([lifecycle, event]);
            expect(result.error).to.have.property('code', 'server_error');
            expect(open.callCount).to.equal(1);
        });
    }

    for (const error of [
        { code: 'rate_limit_exceeded', message: 'Slow down' },
        { type: 'overloaded_error', message: 'Overloaded' },
        { message: 'The server is too busy.' }
    ]) {
        it(`retries an error stream event ${JSON.stringify(error)}`, async () => {
            const open = sinon.stub();
            open.onFirstCall().resolves(events({ ...error, type: 'error' }));
            // SSE error events use `code`; SDK-thrown errors may instead carry an overloaded `type`.
            if (error.type) {
                open.onFirstCall().callsFake(async () => (async function* (): AsyncIterable<unknown> { throw Object.assign(new Error(error.message), error); })());
            }
            open.onSecondCall().resolves(events(output));
            const result = collect(retryOpenAiStream(open, 1, () => true));
            await clock.runAllAsync();
            expect(await result).to.deep.equal({ values: [output] });
            expect(open.callCount).to.equal(2);
        });
    }

    for (const code of ['insufficient_quota', 'billing_hard_limit_reached', 'invalid_api_key', 'invalid_request_error']) {
        it(`does not retry ${code}`, async () => {
            const open = sinon.stub().callsFake(async () => events({ type: 'error', code, message: 'Too busy' }));
            const result = await collect(retryOpenAiStream(open, 3, () => true));
            expect(result.error).to.have.property('code', code);
            expect(open.callCount).to.equal(1);
        });
    }

    it('does not add retries to an opening failure already handled by the SDK', async () => {
        const error = Object.assign(new Error('Service unavailable'), { status: 503 });
        const open = sinon.stub().rejects(error);
        expect((await collect(retryOpenAiStream(open, 3, () => true))).error).to.equal(error);
        expect(open.callCount).to.equal(1);
    });

    it('reports a failed response with no error details instead of silently ending', async () => {
        const open = sinon.stub().resolves(events({ type: 'response.failed', response: {} }));
        const result = await collect(retryOpenAiStream(open, 3, () => true));
        expect(result.error).to.be.instanceOf(Error).with.property('message', 'OpenAI response failed.');
        expect(open.callCount).to.equal(1);
    });

    it('cancels during backoff without sending again', async () => {
        const source = new CancellationTokenSource();
        const open = sinon.stub().callsFake(async () => events(busy));
        const result = collect(retryOpenAiStream(open, 3, () => true, source.token));
        await clock.tickAsync(0);
        source.cancel();
        expect((await result).error).to.be.instanceOf(CancellationError);
        await clock.runAllAsync();
        expect(open.callCount).to.equal(1);
        expect((open.firstCall.args[0] as AbortSignal).aborted).to.equal(true);
        source.dispose();
    });

    it('reports cancellation when the upstream iterator finishes normally on abort', async () => {
        const source = new CancellationTokenSource();
        const open = sinon.stub().callsFake(async (signal: AbortSignal) => (async function* (): AsyncIterable<unknown> {
            yield lifecycle;
            await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
        })());
        const result = collect(retryOpenAiStream(open, 3, () => true, source.token));
        await clock.tickAsync(0);
        source.cancel();
        expect((await result).error).to.be.instanceOf(CancellationError);
        expect(open.callCount).to.equal(1);
        source.dispose();
    });

    it('does not open a cancelled request', async () => {
        const open = sinon.stub();
        const result = await collect(retryOpenAiStream(open, 3, () => true, CancellationToken.Cancelled));
        expect(result.error).to.be.instanceOf(CancellationError);
        expect(open.called).to.equal(false);
    });

    it('aborts the upstream request when the consumer stops reading', async () => {
        const open = sinon.stub().resolves(events(lifecycle, output));
        for await (const event of retryOpenAiStream(open, 3, () => true)) {
            expect(event).to.equal(lifecycle);
            break;
        }
        expect((open.firstCall.args[0] as AbortSignal).aborted).to.equal(true);
        expect(open.callCount).to.equal(1);
    });
});
