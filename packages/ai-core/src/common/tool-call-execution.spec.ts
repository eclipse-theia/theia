// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { CancellationToken, CancellationTokenSource } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    ToolRequest,
    ToolInvocationContext,
    hasToolCallError,
    isToolNotAvailableError,
    isToolCallContent
} from './language-model';
import { ToolCallExecutor, ToolCallExecutionResult } from './tool-call-execution';

/** Builds a minimal {@link ToolRequest} whose handler delegates to `handler`. */
function tool(name: string, handler: ToolRequest['handler']): ToolRequest {
    return { id: name, name, parameters: { type: 'object', properties: {} }, handler };
}

describe('ToolCallExecutor', () => {
    let executor: ToolCallExecutor;

    beforeEach(() => {
        executor = new ToolCallExecutor();
    });

    it('executes the tool calls of a turn concurrently (not sequentially)', async () => {
        // `a` only completes once `b` has started. A sequential implementation that runs
        // `a` before `b` would deadlock here, so this is the core regression test for #17533.
        const bStarted = new Deferred<void>();
        const tools = [
            tool('a', async () => {
                await bStarted.promise;
                return 'a-done';
            }),
            tool('b', async () => {
                bStarted.resolve();
                return 'b-done';
            })
        ];

        const results = await executor.executeToolCalls(
            [{ id: '1', name: 'a', arguments: '{}' }, { id: '2', name: 'b', arguments: '{}' }],
            tools
        );

        expect(results.map(r => r.result)).to.deep.equal(['a-done', 'b-done']);
    });

    it('preserves input order even when calls complete out of order', async () => {
        const aResolves = new Deferred<void>();
        const tools = [
            tool('slow', async () => {
                await aResolves.promise;
                return 'slow-done';
            }),
            tool('fast', async () => {
                // Let `fast` finish first, then release `slow`.
                aResolves.resolve();
                return 'fast-done';
            })
        ];

        const results = await executor.executeToolCalls(
            [{ id: 'a', name: 'slow', arguments: '{}' }, { id: 'b', name: 'fast', arguments: '{}' }],
            tools
        );

        expect(results.map(r => r.id)).to.deep.equal(['a', 'b']);
        expect(results.map(r => r.result)).to.deep.equal(['slow-done', 'fast-done']);
    });

    it('reports a tool-not-available error when no tool matches the name', async () => {
        const results = await executor.executeToolCalls(
            [{ id: '1', name: 'missing', arguments: '{}' }],
            [tool('present', async () => 'ok')]
        );

        expect(results).to.have.lengthOf(1);
        expect(results[0].notFound).to.equal(true);
        expect(results[0].error).to.equal(undefined);
        expect(isToolCallContent(results[0].result)).to.equal(true);
        expect(isToolCallContent(results[0].result) && results[0].result.content.some(isToolNotAvailableError)).to.equal(true);
    });

    it('isolates a throwing handler: it does not reject, exposes the error, and siblings still resolve', async () => {
        const boom = new Error('handler boom');
        const results = await executor.executeToolCalls(
            [{ id: '1', name: 'throws', arguments: '{}' }, { id: '2', name: 'ok', arguments: '{}' }],
            [
                tool('throws', async () => { throw boom; }),
                tool('ok', async () => 'ok-result')
            ]
        );

        const thrown = results.find(r => r.id === '1')!;
        const succeeded = results.find(r => r.id === '2')!;
        expect(thrown.error).to.equal(boom);
        expect(hasToolCallError(thrown.result)).to.equal(true);
        expect(thrown.notFound).to.equal(false);
        expect(succeeded.result).to.equal('ok-result');
    });

    it('invokes onResult exactly once per tool call', async () => {
        const seen: string[] = [];
        await executor.executeToolCalls(
            [{ id: '1', name: 'a', arguments: '{}' }, { id: '2', name: 'b', arguments: '{}' }],
            [tool('a', async () => 'a'), tool('b', async () => 'b')],
            { onResult: (r: ToolCallExecutionResult) => seen.push(r.id) }
        );

        expect(seen.slice().sort()).to.deep.equal(['1', '2']);
    });

    it('forwards the cancellation token into each ToolInvocationContext', async () => {
        const source = new CancellationTokenSource();
        let received: CancellationToken | undefined;
        await executor.executeToolCalls(
            [{ id: '1', name: 'a', arguments: '{}' }],
            [tool('a', async (_args, ctx) => { received = ToolInvocationContext.getCancellationToken(ctx); return 'a'; })],
            { cancellationToken: source.token }
        );

        expect(received).to.equal(source.token);
    });

    it('does not let a throwing onResult callback reject the execution or affect the results', async () => {
        const results = await executor.executeToolCalls(
            [{ id: '1', name: 'a', arguments: '{}' }, { id: '2', name: 'b', arguments: '{}' }],
            [tool('a', async () => 'a-done'), tool('b', async () => 'b-done')],
            { onResult: () => { throw new Error('reporting boom'); } }
        );

        expect(results.map(r => r.result)).to.deep.equal(['a-done', 'b-done']);
    });

    it('returns an empty array and never calls onResult for empty input', async () => {
        let called = false;
        const results = await executor.executeToolCalls([], [tool('a', async () => 'a')], { onResult: () => { called = true; } });
        expect(results).to.deep.equal([]);
        expect(called).to.equal(false);
    });
});
