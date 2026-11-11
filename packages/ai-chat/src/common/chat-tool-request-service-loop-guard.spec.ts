// *****************************************************************************
// Copyright (C) 2026 Ericsson.
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

import { ToolCallResult, ToolRequest, createToolCallError, isToolCallContent, isToolLoopDetectedError } from '@theia/ai-core';
import { URI } from '@theia/core';
import { expect } from 'chai';
import { FileReadTracker } from './file-read-tracker.js';
import { ChatToolRequestService, LoopContinueDecision, ToolLoopGuardConfig } from './chat-tool-request-service.js';
import { MutableChatRequestModel } from './chat-model.js';

const SESSION = 'session-1';

/** Records every forceRefresh call and reports a fixed set of still-stale labels. */
class FakeFileReadTracker implements FileReadTracker {
    readonly refreshCalls: { sessionId: string, uri?: URI }[] = [];
    staleLabels: string[] = ['workspace/a.ts'];
    async recordRead(): Promise<void> { }
    async isStale(): Promise<boolean> { return false; }
    async getChangedFiles(): Promise<string[]> { return []; }
    async forceRefresh(sessionId: string, uri?: URI): Promise<string[]> {
        this.refreshCalls.push({ sessionId, uri });
        return this.staleLabels;
    }
}

/** Exposes the guard and lets a test drive the config and the tracker without a DI container. */
class TestChatToolRequestService extends ChatToolRequestService {
    config: ToolLoopGuardConfig = { enabled: true, refreshThreshold: 3, promptThreshold: 0, failThreshold: 5 };
    /** Decisions to return from the prompt, consumed in order; defaults to 'continue' when exhausted. */
    promptDecisions: LoopContinueDecision[] = [];
    /** How many times the user was prompted, and with what count. */
    readonly promptCalls: { count: number }[] = [];
    constructor(tracker?: FileReadTracker) {
        super();
        // The field is injected in production; set it directly here.
        (this as unknown as { fileReadTracker?: FileReadTracker }).fileReadTracker = tracker;
    }
    protected override getLoopGuardConfig(): ToolLoopGuardConfig {
        return this.config;
    }
    protected override async promptContinueOnLoop(
        _request: MutableChatRequestModel,
        _toolRequest: ToolRequest,
        count: number
    ): Promise<LoopContinueDecision> {
        this.promptCalls.push({ count });
        return this.promptDecisions.shift() ?? 'continue';
    }
    run(toolRequest: ToolRequest, args: string, chatRequest: MutableChatRequestModel, result: () => Promise<ToolCallResult>): Promise<ToolCallResult> {
        return this.invokeWithLoopGuard(toolRequest, args, chatRequest, result);
    }
}

function request(sessionId = SESSION): MutableChatRequestModel {
    return { session: { id: sessionId } } as unknown as MutableChatRequestModel;
}

const tool: ToolRequest = {
    id: 'writeFileReplacements',
    name: 'writeFileReplacements',
    parameters: { type: 'object', properties: {} },
    handler: async () => undefined
};

const ARGS = JSON.stringify({ path: '/workspace/a.ts', replacements: [] });

function loopDetectedText(result: ToolCallResult): string | undefined {
    if (isToolCallContent(result)) {
        const err = result.content.find(isToolLoopDetectedError);
        return err?.data;
    }
    return undefined;
}

describe('ChatToolRequestService loop guard', () => {

    it('passes through when the guard is disabled', async () => {
        const service = new TestChatToolRequestService();
        service.config = { enabled: false, refreshThreshold: 3, promptThreshold: 0, failThreshold: 5 };
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);
        for (let i = 0; i < 10; i++) {
            const result = await service.run(tool, ARGS, request(), error);
            expect(loopDetectedText(result)).to.be.undefined;
        }
    });

    it('returns successful results unchanged and resets the counter', async () => {
        const service = new TestChatToolRequestService();
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);
        const ok = () => Promise.resolve('done' as ToolCallResult);
        await service.run(tool, ARGS, request(), error);
        await service.run(tool, ARGS, request(), error);
        // A success in between must reset the run of identical errors.
        expect(await service.run(tool, ARGS, request(), ok)).to.equal('done');
        // So the next two errors do not yet trip the refresh threshold.
        expect(loopDetectedText(await service.run(tool, ARGS, request(), error))).to.be.undefined;
        expect(loopDetectedText(await service.run(tool, ARGS, request(), error))).to.be.undefined;
    });

    it('forces a refresh once the refresh threshold is reached', async () => {
        const tracker = new FakeFileReadTracker();
        const service = new TestChatToolRequestService(tracker);
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

        expect(loopDetectedText(await service.run(tool, ARGS, request(), error))).to.be.undefined; // 1
        expect(loopDetectedText(await service.run(tool, ARGS, request(), error))).to.be.undefined; // 2
        const refreshResult = await service.run(tool, ARGS, request(), error); // 3 -> refresh

        expect(tracker.refreshCalls).to.have.lengthOf(1);
        expect(tracker.refreshCalls[0].uri?.toString()).to.equal('file:///workspace/a.ts');
        const text = loopDetectedText(refreshResult);
        expect(text).to.be.a('string');
        expect(text).to.contain('workspace/a.ts');
        // The agent is told to actually re-read; the stale protection is kept in place meanwhile.
        expect(text).to.contain('re-read');
        expect(text).to.contain('still out of sync');
    });

    it('triggers a refresh on the very first error when refreshThreshold is 1', async () => {
        const tracker = new FakeFileReadTracker();
        const service = new TestChatToolRequestService(tracker);
        // Regression for a refreshThreshold of 1 being skipped by the first-occurrence early return.
        service.config = { enabled: true, refreshThreshold: 1, promptThreshold: 0, failThreshold: 2 };
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

        const first = await service.run(tool, ARGS, request(), error); // 1 -> refresh immediately

        expect(tracker.refreshCalls).to.have.lengthOf(1);
        expect(loopDetectedText(first)).to.contain('still out of sync');
    });

    it('does not force a refresh twice for the same run of errors', async () => {
        const tracker = new FakeFileReadTracker();
        const service = new TestChatToolRequestService(tracker);
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

        await service.run(tool, ARGS, request(), error); // 1
        await service.run(tool, ARGS, request(), error); // 2
        await service.run(tool, ARGS, request(), error); // 3 -> refresh
        await service.run(tool, ARGS, request(), error); // 4 -> no second refresh

        expect(tracker.refreshCalls).to.have.lengthOf(1);
    });

    it('fails the request once the fail threshold is reached', async () => {
        const tracker = new FakeFileReadTracker();
        const service = new TestChatToolRequestService(tracker);
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

        for (let i = 0; i < 4; i++) {
            await service.run(tool, ARGS, request(), error);
        }
        const failResult = await service.run(tool, ARGS, request(), error); // 5 -> fail

        const text = loopDetectedText(failResult);
        expect(text).to.be.a('string');
        // The failure is advisory only: it hints the tool loop to stop without cancelling anything.
        expect(text).to.contain('only a hint to stop');
        expect(text).to.contain('nothing has been cancelled');
        // The abort message must carry actionable loop-breaking tips, including the local-model levers.
        expect(text).to.contain('Tips to break the loop');
        expect(text).to.contain('temperature');
        expect(text).to.contain('context size');
        expect(text).to.contain('local model');
    });

    it('resets the counter when the arguments change', async () => {
        const service = new TestChatToolRequestService(new FakeFileReadTracker());
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);
        const otherArgs = JSON.stringify({ path: '/workspace/b.ts', replacements: [] });

        await service.run(tool, ARGS, request(), error); // 1 for a.ts
        await service.run(tool, ARGS, request(), error); // 2 for a.ts
        // Switching arguments resets, so this is attempt 1 again, not the refresh threshold.
        expect(loopDetectedText(await service.run(tool, otherArgs, request(), error))).to.be.undefined;
    });

    it('counts errors reported as ToolCallContent errors', async () => {
        const tracker = new FakeFileReadTracker();
        const service = new TestChatToolRequestService(tracker);
        const error = () => Promise.resolve(createToolCallError('stale') as ToolCallResult);

        await service.run(tool, ARGS, request(), error); // 1
        await service.run(tool, ARGS, request(), error); // 2
        await service.run(tool, ARGS, request(), error); // 3 -> refresh

        expect(tracker.refreshCalls).to.have.lengthOf(1);
    });

    it('still fails the request when no file read tracker is bound', async () => {
        const service = new TestChatToolRequestService();
        const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

        let last: ToolCallResult;
        for (let i = 0; i < 5; i++) {
            last = await service.run(tool, ARGS, request(), error);
        }
        expect(loopDetectedText(last!)).to.contain('only a hint to stop');
    });

    describe('continue prompt', () => {

        it('asks the user to continue at the prompt threshold', async () => {
            const service = new TestChatToolRequestService(new FakeFileReadTracker());
            service.config = { enabled: true, refreshThreshold: 2, promptThreshold: 3, failThreshold: 5 };
            const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

            await service.run(tool, ARGS, request(), error); // 1
            await service.run(tool, ARGS, request(), error); // 2 -> refresh
            expect(service.promptCalls).to.have.lengthOf(0);
            await service.run(tool, ARGS, request(), error); // 3 -> prompt

            expect(service.promptCalls).to.deep.equal([{ count: 3 }]);
        });

        it('stops the loop with a terminal error when the user chooses to stop', async () => {
            const service = new TestChatToolRequestService(new FakeFileReadTracker());
            service.config = { enabled: true, refreshThreshold: 2, promptThreshold: 3, failThreshold: 5 };
            service.promptDecisions = ['stop'];
            const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

            await service.run(tool, ARGS, request(), error); // 1
            await service.run(tool, ARGS, request(), error); // 2 -> refresh
            const stopResult = await service.run(tool, ARGS, request(), error); // 3 -> prompt -> stop

            const text = loopDetectedText(stopResult);
            expect(text).to.be.a('string');
            expect(text).to.contain('Stopped at your request');
        });

        it('lets the agent keep going when the user chooses to continue', async () => {
            const service = new TestChatToolRequestService(new FakeFileReadTracker());
            service.config = { enabled: true, refreshThreshold: 2, promptThreshold: 3, failThreshold: 5 };
            service.promptDecisions = ['continue'];
            const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

            await service.run(tool, ARGS, request(), error); // 1
            await service.run(tool, ARGS, request(), error); // 2 -> refresh
            const continueResult = await service.run(tool, ARGS, request(), error); // 3 -> prompt -> continue

            // Continuing surfaces the original error unchanged, not a loop-detected terminal error.
            expect(loopDetectedText(continueResult)).to.be.undefined;
            expect(continueResult).to.equal('{"error":"stale"}');
        });

        it('asks only once per run of identical errors', async () => {
            const service = new TestChatToolRequestService(new FakeFileReadTracker());
            service.config = { enabled: true, refreshThreshold: 2, promptThreshold: 3, failThreshold: 10 };
            service.promptDecisions = ['continue'];
            const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

            for (let i = 0; i < 6; i++) {
                await service.run(tool, ARGS, request(), error);
            }

            expect(service.promptCalls).to.have.lengthOf(1);
        });

        it('never prompts when the prompt threshold is 0', async () => {
            const service = new TestChatToolRequestService(new FakeFileReadTracker());
            service.config = { enabled: true, refreshThreshold: 2, promptThreshold: 0, failThreshold: 5 };
            const error = () => Promise.resolve('{"error":"stale"}' as ToolCallResult);

            for (let i = 0; i < 4; i++) {
                await service.run(tool, ARGS, request(), error);
            }

            expect(service.promptCalls).to.have.lengthOf(0);
        });
    });
});
