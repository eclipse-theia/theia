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
import { LanguageModelStreamResponsePart, ToolCallResponsePart, ToolRequest, UserRequest } from '@theia/ai-core';
import type { CopilotClient, PermissionRequest, Tool } from './copilot-sdk-types';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { approveTheiaTools, CopilotSdkLanguageModel, CopilotStreamSink } from './copilot-sdk-language-model';

class TestableCopilotSdkLanguageModel extends CopilotSdkLanguageModel {
    constructor() {
        super('copilot/test', 'test-model', { status: 'ready' }, 3, async () => ({} as CopilotClient), new MockLogger());
    }

    callCreateTools(tools: ToolRequest[], sink: CopilotStreamSink): Tool[] {
        return this.createTools(tools, sink);
    }

    /** Captures the session configuration the model would create for a request. */
    async captureSessionConfig(request: UserRequest): Promise<Record<string, unknown>> {
        let captured: Record<string, unknown> = {};
        const client = {
            createSession: async (config: Record<string, unknown>) => {
                captured = config;
                return { on: () => () => { }, send: async () => { }, abort: async () => { }, disconnect: async () => { } };
            }
        } as unknown as CopilotClient;
        const model = new TestableCopilotSdkLanguageModel();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (model as any).clientProvider = async () => client;
        await model.request(request);
        return captured;
    }

    /**
     * Runs a request against a session that reports itself idle as soon as it was sent to, and
     * reports what the session was configured with, what it was sent, and what was discarded.
     */
    async captureTurn(request: UserRequest): Promise<{ config: Record<string, unknown>, prompt?: string, deleted?: string }> {
        let config: Record<string, unknown> = {};
        let prompt: string | undefined;
        let deleted: string | undefined;
        const listeners = new Map<string, (event: unknown) => void>();
        const session = {
            sessionId: 'test-session',
            on: (event: string, handler: (payload: unknown) => void) => {
                listeners.set(event, handler);
                return () => listeners.delete(event);
            },
            send: async (message: { prompt: string }) => {
                prompt = message.prompt;
                listeners.get('session.idle')?.({});
            },
            abort: async () => { },
            disconnect: async () => { }
        };
        const client = {
            createSession: async (sessionConfig: Record<string, unknown>) => {
                config = sessionConfig;
                return session;
            },
            deleteSession: async (sessionId: string) => { deleted = sessionId; }
        } as unknown as CopilotClient;
        const model = new TestableCopilotSdkLanguageModel();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (model as any).clientProvider = async () => client;
        const response = await model.request(request) as { stream: AsyncIterable<LanguageModelStreamResponsePart> };
        for await (const part of response.stream) {
            expect(part).to.exist;
        }
        return { config, prompt, deleted };
    }
}

function toolRequest(name: string, handler: (args: string, ctx?: { toolCallId?: string }) => Promise<string>): ToolRequest {
    return {
        id: name,
        name,
        description: `the ${name} tool`,
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
        handler
    };
}

/**
 * Runs a tool invocation the way the caller does, with the stream being consumed concurrently.
 * The handler waits for its reported call to be consumed, so nothing may invoke it in isolation.
 */
async function invokeWhileConsuming(
    sink: CopilotStreamSink,
    invoke: () => Promise<unknown> | unknown
): Promise<{ result: unknown, parts: LanguageModelStreamResponsePart[] }> {
    const parts: LanguageModelStreamResponsePart[] = [];
    const consumer = (async () => {
        for await (const part of sink.drain()) {
            parts.push(part);
        }
    })();
    const result = await invoke();
    sink.finish();
    await consumer;
    return { result, parts };
}

async function collect(sink: CopilotStreamSink): Promise<LanguageModelStreamResponsePart[]> {
    const parts: LanguageModelStreamResponsePart[] = [];
    for await (const part of sink.drain()) {
        parts.push(part);
    }
    return parts;
}

function toolCalls(part: LanguageModelStreamResponsePart): ToolCallResponsePart['tool_calls'] {
    return (part as ToolCallResponsePart).tool_calls;
}

describe('CopilotSdkLanguageModel - createTools', () => {

    const model = new TestableCopilotSdkLanguageModel();

    it('should declare the tools of the request to the CLI', () => {
        const tools = model.callCreateTools([toolRequest('readFile', async () => 'content')], new CopilotStreamSink());
        expect(tools).to.have.lengthOf(1);
        expect(tools[0].name).to.equal('readFile');
        expect(tools[0].description).to.equal('the readFile tool');
        expect(tools[0].parameters).to.deep.equal({ type: 'object', properties: { path: { type: 'string' } } });
        // Theia confirms tool invocations itself, so the CLI must not prompt again.
        expect(tools[0].skipPermission).to.be.true;
    });

    it('should pass the raw argument string to the handler of the request', async () => {
        let received: string | undefined;
        const sink = new CopilotStreamSink();
        const tools = model.callCreateTools([toolRequest('readFile', async args => { received = args; return 'content'; })], sink);

        const { result } = await invokeWhileConsuming(sink, () =>
            tools[0].handler!({ path: 'a.ts' }, { sessionId: 's', toolCallId: 'call_1', toolName: 'readFile', arguments: {} }));

        expect(received).to.equal(JSON.stringify({ path: 'a.ts' }));
        expect(result).to.equal('content');
    });

    it('should report the invocation as an unfinished and then a finished tool call', async () => {
        const sink = new CopilotStreamSink();
        const tools = model.callCreateTools([toolRequest('readFile', async () => 'content')], sink);

        const { parts } = await invokeWhileConsuming(sink, () =>
            tools[0].handler!({ path: 'a.ts' }, { sessionId: 's', toolCallId: 'call_1', toolName: 'readFile', arguments: {} }));

        expect(parts).to.have.lengthOf(2);
        expect(toolCalls(parts[0])[0]).to.deep.include({ id: 'call_1', finished: false });
        expect(toolCalls(parts[0])[0].function).to.deep.equal({ name: 'readFile', arguments: JSON.stringify({ path: 'a.ts' }) });
        expect(toolCalls(parts[1])[0]).to.deep.include({ id: 'call_1', finished: true, result: 'content' });
    });

    it('should report a failing tool to the stream and to the agent instead of throwing', async () => {
        const sink = new CopilotStreamSink();
        const tools = model.callCreateTools([toolRequest('readFile', async () => { throw new Error('no such file'); })], sink);

        const { result, parts } = await invokeWhileConsuming(sink, () =>
            tools[0].handler!({ path: 'missing.ts' }, { sessionId: 's', toolCallId: 'call_1', toolName: 'readFile', arguments: {} }));

        expect(result).to.deep.equal({ error: 'no such file' });
        expect(toolCalls(parts[1])[0]).to.deep.include({ id: 'call_1', finished: true, result: 'Error: no such file' });
    });

    it('should return an empty tool list when the request has no tools', () => {
        expect(model.callCreateTools([], new CopilotStreamSink())).to.be.empty;
    });
});

describe('CopilotSdkLanguageModel - session configuration', () => {

    const model = new TestableCopilotSdkLanguageModel();

    function requestWith(tools: ToolRequest[]): UserRequest {
        return { messages: [{ actor: 'user', type: 'text', text: 'hi' }], tools } as unknown as UserRequest;
    }

    it('should enable the declared tools and nothing else', async () => {
        const config = await model.captureSessionConfig(requestWith([toolRequest('readFile', async () => 'content')]));
        // An empty list would match nothing and would disable the declared tools as well.
        expect(config.availableTools).to.deep.equal(['custom:*']);
        expect((config.tools as Tool[]).map(tool => tool.name)).to.deep.equal(['readFile']);
    });

    it('should declare every tool of the request', async () => {
        const config = await model.captureSessionConfig(requestWith([
            toolRequest('readFile', async () => 'a'),
            toolRequest('listFiles', async () => 'b')
        ]));
        expect((config.tools as Tool[]).map(tool => tool.name)).to.deep.equal(['readFile', 'listFiles']);
    });

    it('should still exclude the built-in tools when the request has none', async () => {
        const config = await model.captureSessionConfig(requestWith([]));
        expect(config.availableTools).to.deep.equal(['custom:*']);
        expect(config.tools).to.be.empty;
    });
});

describe('approveTheiaTools', () => {

    const customToolRequest = { kind: 'custom-tool', toolName: 'readFile' } as unknown as PermissionRequest;

    it('should approve a request for a tool Theia declared and confirmed itself', () => {
        expect(approveTheiaTools(customToolRequest, { sessionId: 'test-session' })).to.deep.equal({ kind: 'approve-once' });
    });

    it('should report that nobody can confirm a request managed policy reserves for a decision', () => {
        const request = { ...customToolRequest, managedApprovalRequired: true } as unknown as PermissionRequest;
        // Not `no-result`: that leaves the request pending for another client, and there is none here.
        expect(approveTheiaTools(request, { sessionId: 'test-session' })).to.deep.equal({ kind: 'user-not-available' });
    });

    it('should report the same when the machine has managed settings enabled at all', () => {
        expect(approveTheiaTools(customToolRequest, { sessionId: 'test-session', managedSettingsEnabled: true }))
            .to.deep.equal({ kind: 'user-not-available' });
    });
});

describe('CopilotSdkLanguageModel - turn', () => {

    const model = new TestableCopilotSdkLanguageModel();

    const request = {
        messages: [
            { actor: 'system', type: 'text', text: 'You are a helpful assistant.' },
            { actor: 'user', type: 'text', text: 'hi' }
        ]
    } as unknown as UserRequest;

    it('should configure the system prompt as the system message of the session', async () => {
        const { config } = await model.captureTurn(request);
        expect(config.systemMessage).to.deep.include({ mode: 'customize', content: 'You are a helpful assistant.' });
    });

    it('should send the user turn without the system prompt in it', async () => {
        const { prompt } = await model.captureTurn(request);
        expect(prompt).to.equal('hi');
    });

    it('should delete the session it created, which the CLI would otherwise keep', async () => {
        const { deleted } = await model.captureTurn(request);
        expect(deleted).to.equal('test-session');
    });
});

describe('CopilotStreamSink', () => {

    it('should yield parts pushed before draining', async () => {
        const sink = new CopilotStreamSink();
        sink.push({ content: 'a' });
        sink.push({ content: 'b' });
        sink.finish();
        expect(await collect(sink)).to.deep.equal([{ content: 'a' }, { content: 'b' }]);
    });

    it('should yield parts pushed while draining', async () => {
        const sink = new CopilotStreamSink();
        const collected = collect(sink);
        sink.push({ content: 'a' });
        await Promise.resolve();
        sink.push({ content: 'b' });
        sink.finish();
        expect(await collected).to.deep.equal([{ content: 'a' }, { content: 'b' }]);
    });

    it('should raise the failure after the buffered parts have been drained', async () => {
        const sink = new CopilotStreamSink();
        sink.push({ content: 'partial' });
        sink.finish(new Error('session failed'));

        const parts: LanguageModelStreamResponsePart[] = [];
        let error: unknown;
        try {
            for await (const part of sink.drain()) {
                parts.push(part);
            }
        } catch (caught) {
            error = caught;
        }

        expect(parts).to.deep.equal([{ content: 'partial' }]);
        expect((error as Error).message).to.equal('session failed');
    });

    it('should end without parts when finished immediately', async () => {
        const sink = new CopilotStreamSink();
        sink.finish();
        expect(await collect(sink)).to.be.empty;
    });
});

describe('CopilotSdkLanguageModel - tool call ordering', () => {

    const model = new TestableCopilotSdkLanguageModel();
    const invocation = { sessionId: 's', toolCallId: 'call_1', toolName: 'readFile', arguments: {} };

    it('should report the call before running the tool, so the caller can record it first', async () => {
        const sink = new CopilotStreamSink();
        const observed: string[] = [];
        const tools = model.callCreateTools([toolRequest('readFile', async () => {
            observed.push('tool ran');
            return 'content';
        })], sink);

        const invoked = tools[0].handler!({ path: 'a.ts' }, invocation);

        // The consumer has not taken the part yet, so the tool must not have run.
        expect(observed).to.be.empty;

        const parts: LanguageModelStreamResponsePart[] = [];
        const consumer = (async () => {
            for await (const part of sink.drain()) {
                parts.push(part);
                observed.push('part consumed');
            }
        })();

        await invoked;
        sink.finish();
        await consumer;

        expect(observed[0]).to.equal('part consumed');
        expect(observed).to.contain('tool ran');
        expect(toolCalls(parts[0])[0]).to.deep.include({ id: 'call_1', finished: false });
    });

    it('should pass the call id to the handler so the caller can correlate it', async () => {
        const sink = new CopilotStreamSink();
        let receivedId: string | undefined;
        const tools = model.callCreateTools([toolRequest('readFile', async (_args, ctx) => {
            receivedId = ctx?.toolCallId;
            return 'content';
        })], sink);

        const invoked = tools[0].handler!({ path: 'a.ts' }, invocation);
        const consumer = (async () => {
            for await (const part of sink.drain()) {
                expect(part).to.exist;
            }
        })();
        await invoked;
        sink.finish();
        await consumer;

        expect(receivedId).to.equal('call_1');
    });
});
