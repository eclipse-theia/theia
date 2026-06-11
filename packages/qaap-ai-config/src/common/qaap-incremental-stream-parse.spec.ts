// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { LanguageModelStreamResponse, LanguageModelStreamResponsePart, isTextResponsePart } from '@theia/ai-core/lib/common';
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import {
    ChatResponseContent,
    MarkdownChatResponseContent,
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    ToolCallChatResponseContentImpl,
} from '@theia/ai-chat/lib/common/chat-model';
import { parseContents } from '@theia/ai-chat/lib/common/parse-contents';
import {
    consumeIncrementalLanguageModelStream,
    patchAbstractStreamParsingChatAgentForIncrementalParse,
    resetIncrementalStreamPatchForTests,
    streamBufferNeedsStructuredParse,
    type QaapStreamParsingAgentHost,
} from './qaap-incremental-stream-parse';

describe('qaap-incremental-stream-parse', () => {

    afterEach(() => {
        resetIncrementalStreamPatchForTests();
    });

    it('streamBufferNeedsStructuredParse detects fenced code openers', () => {
        expect(streamBufferNeedsStructuredParse('plain prose only')).to.equal(false);
        expect(streamBufferNeedsStructuredParse('intro\n```typescript\nconst x = 1')).to.equal(true);
        expect(streamBufferNeedsStructuredParse('tilde fence\n~~~\n')).to.equal(true);
    });

    it('patchAbstractStreamParsingChatAgentForIncrementalParse is idempotent', () => {
        resetIncrementalStreamPatchForTests();
        patchAbstractStreamParsingChatAgentForIncrementalParse();
        const patched = (AbstractStreamParsingChatAgent.prototype as unknown as { addStreamResponse?: unknown }).addStreamResponse;
        patchAbstractStreamParsingChatAgentForIncrementalParse();
        expect((AbstractStreamParsingChatAgent.prototype as unknown as { addStreamResponse?: unknown }).addStreamResponse).to.equal(patched);
    });

    it('consumeIncrementalLanguageModelStream appends plain markdown without per-token parseContents', async () => {
        let parseCalls = 0;
        const agent: QaapStreamParsingAgentHost = {
            parseContents: (text, request) => {
                parseCalls++;
                return parseContents(text, request);
            },
            parse: token => new MarkdownChatResponseContentImpl(isTextResponsePart(token) ? token.content : ''),
        };
        const responseBody = createMutableResponseBody();
        const request = { response: { response: responseBody } } as MutableChatRequestModel;
        const stream = async function* (): AsyncGenerator<LanguageModelStreamResponsePart> {
            for (let i = 0; i < 120; i++) {
                yield { content: ` token-${i}` };
            }
        };
        const languageModelResponse: LanguageModelStreamResponse = { stream: stream() };

        await consumeIncrementalLanguageModelStream(agent, languageModelResponse, request);

        expect(parseCalls).to.equal(1);
        expect(responseBody.content).to.have.length(1);
        expect(MarkdownChatResponseContent.is(responseBody.content[0])).to.equal(true);
        expect((responseBody.content[0] as MarkdownChatResponseContentImpl).content.value).to.include('token-119');
    });

    it('consumeIncrementalLanguageModelStream re-parses when a code fence appears', async () => {
        let parseCalls = 0;
        const agent: QaapStreamParsingAgentHost = {
            parseContents: (text, request) => {
                parseCalls++;
                return parseContents(text, request);
            },
            parse: token => new MarkdownChatResponseContentImpl(isTextResponsePart(token) ? token.content : ''),
        };
        const responseBody = createMutableResponseBody();
        const request = { response: { response: responseBody } } as MutableChatRequestModel;
        const parts = ['Hello', '\n```ts\n', 'const a = 1\n', '```'];
        const stream = async function* (): AsyncGenerator<LanguageModelStreamResponsePart> {
            for (const content of parts) {
                yield { content };
            }
        };

        await consumeIncrementalLanguageModelStream(agent, { stream: stream() }, request);

        expect(parseCalls).to.be.greaterThan(1);
        expect(responseBody.content.some(part => part.kind === 'code')).to.equal(true);
    });

    it('consumeIncrementalLanguageModelStream inserts non-text tool tokens and resets markdown buffer', async () => {
        const toolPart = new ToolCallChatResponseContentImpl('tool-1', 'read_file', '{}', true);
        const agent: QaapStreamParsingAgentHost = {
            parseContents: (text, request) => parseContents(text, request),
            parse: token => {
                if (isTextResponsePart(token)) {
                    return new MarkdownChatResponseContentImpl(token.content);
                }
                if ('tool_calls' in token) {
                    return [toolPart];
                }
                return new MarkdownChatResponseContentImpl('');
            },
        };
        const responseBody = createMutableResponseBody();
        const request = { response: { response: responseBody } } as MutableChatRequestModel;
        const stream = async function* (): AsyncGenerator<LanguageModelStreamResponsePart> {
            yield { content: 'Before tool' };
            yield { tool_calls: [{ id: 'tool-1', function: { name: 'read_file', arguments: '{}' } }] };
            yield { content: ' after tool' };
        };

        await consumeIncrementalLanguageModelStream(agent, { stream: stream() }, request);

        expect(responseBody.content.some(part => part.kind === 'toolCall')).to.equal(true);
        expect(responseBody.content.filter(part => MarkdownChatResponseContent.is(part))).to.have.length(2);
    });

    it('consumeIncrementalLanguageModelStream skips unknown stream chunks', async () => {
        let parseCalls = 0;
        const agent: QaapStreamParsingAgentHost = {
            parseContents: (text, request) => {
                parseCalls++;
                return parseContents(text, request);
            },
            parse: token => new MarkdownChatResponseContentImpl(isTextResponsePart(token) ? token.content : ''),
        };
        const responseBody = createMutableResponseBody();
        const request = { response: { response: responseBody } } as MutableChatRequestModel;
        const stream = async function* (): AsyncGenerator<unknown> {
            yield { unexpected: true };
            yield { content: 'ok' };
        };

        await consumeIncrementalLanguageModelStream(
            agent,
            { stream: stream() as LanguageModelStreamResponse['stream'] },
            request,
        );

        expect(parseCalls).to.equal(1);
        expect(responseBody.content).to.have.length(1);
    });

    it('logs incremental parse stats when qaap.streamMetrics is enabled', async () => {
        const previousStorage = (global as { localStorage?: Storage }).localStorage;
        const storage = new Map<string, string>();
        (global as { localStorage: Storage }).localStorage = {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => { storage.set(key, value); },
            removeItem: key => { storage.delete(key); },
            clear: () => { storage.clear(); },
            key: () => null,
            length: 0,
        };
        storage.set('qaap.streamMetrics', '1');
        const debugLines: string[] = [];
        const previousDebug = console.debug;
        console.debug = (message?: unknown) => {
            if (typeof message === 'string') {
                debugLines.push(message);
            }
        };
        try {
            const agent: QaapStreamParsingAgentHost = {
                parseContents: (text, request) => parseContents(text, request),
                parse: token => new MarkdownChatResponseContentImpl(isTextResponsePart(token) ? token.content : ''),
            };
            const responseBody = createMutableResponseBody();
            const request = { response: { response: responseBody } } as MutableChatRequestModel;
            await consumeIncrementalLanguageModelStream(agent, {
                stream: (async function* () {
                    yield { content: 'metrics probe' };
                })(),
            }, request);
            expect(debugLines.some(line => line.includes('[Qaap incremental stream parse]'))).to.equal(true);
        } finally {
            console.debug = previousDebug;
            if (previousStorage) {
                (global as { localStorage?: Storage }).localStorage = previousStorage;
            } else {
                delete (global as { localStorage?: Storage }).localStorage;
            }
        }
    });
});

function createMutableResponseBody(): {
    content: ChatResponseContent[];
    clearContent(): void;
    addContent(content: ChatResponseContent): void;
    addContents(contents: ChatResponseContent[]): void;
    responseContentChanged(): void;
} {
    const state = { content: [] as ChatResponseContent[], changes: 0 };
    return {
        get content() {
            return state.content;
        },
        clearContent(): void {
            state.content = [];
        },
        addContent(content: ChatResponseContent): void {
            state.content.push(content);
        },
        addContents(contents: ChatResponseContent[]): void {
            state.content.push(...contents);
        },
        responseContentChanged(): void {
            state.changes++;
        },
    };
}
