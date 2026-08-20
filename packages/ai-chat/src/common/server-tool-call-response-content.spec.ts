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
import { ILogger } from '@theia/core/lib/common';
import { ChatContentDeserializerRegistryImpl, DefaultChatContentDeserializerContribution } from './chat-content-deserializer';
import { ServerToolCallChatResponseContent, ServerToolCallChatResponseContentImpl } from './chat-model';

class MockLogger {
    error(): void { }
    warn(): void { }
    info(): void { }
    debug(): void { }
}

describe('ServerToolCallChatResponseContentImpl', () => {

    describe('toLanguageModelMessage', () => {
        it('should yield a server_tool_use message with parsed input, result and data', () => {
            const content = new ServerToolCallChatResponseContentImpl(
                'call-1',
                'web_fetch',
                '{"url": "https://example.com"}',
                true,
                { content: [{ type: 'text', text: 'fetched' }] },
                { foo: 'bar' }
            );

            const message = content.toLanguageModelMessage();

            expect(message.type).to.equal('server_tool_use');
            expect(message.actor).to.equal('ai');
            expect(message.id).to.equal('call-1');
            expect(message.name).to.equal('web_fetch');
            expect(message.input).to.deep.equal({ url: 'https://example.com' });
            expect(message.result).to.deep.equal({ content: [{ type: 'text', text: 'fetched' }] });
            expect(message.data).to.deep.equal({ foo: 'bar' });
        });

        it('should default to an empty object input for empty arguments', () => {
            const content = new ServerToolCallChatResponseContentImpl('call-2', 'web_search', '', true);
            expect(content.toLanguageModelMessage().input).to.deep.equal({});
        });
    });

    describe('merge', () => {
        it('should update arguments, result and finished by matching id', () => {
            const content = new ServerToolCallChatResponseContentImpl('call-1', 'web_fetch', '', false);
            const update = new ServerToolCallChatResponseContentImpl(
                'call-1', 'web_fetch', '{"url": "https://example.com"}', true, { content: [{ type: 'text', text: 'done' }] }
            );

            const merged = content.merge(update);

            expect(merged).to.be.true;
            expect(content.finished).to.be.true;
            expect(content.arguments).to.equal('{"url": "https://example.com"}');
            expect(content.result).to.deep.equal({ content: [{ type: 'text', text: 'done' }] });
        });

        it('should not merge content with a different id', () => {
            const content = new ServerToolCallChatResponseContentImpl('call-1', 'web_fetch', '', false);
            const other = new ServerToolCallChatResponseContentImpl('call-2', 'web_fetch', '{}', true);
            expect(content.merge(other)).to.be.false;
            expect(content.finished).to.be.false;
        });
    });

    describe('serialization round-trip', () => {
        let registry: ChatContentDeserializerRegistryImpl;

        beforeEach(() => {
            registry = new ChatContentDeserializerRegistryImpl();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (registry as any).logger = new MockLogger() as unknown as ILogger;
            new DefaultChatContentDeserializerContribution().registerDeserializers(registry);
        });

        it('should serialize to kind serverToolCall and deserialize as a finished server tool call', async () => {
            const original = new ServerToolCallChatResponseContentImpl(
                'call-1',
                'web_fetch',
                '{"url": "https://example.com"}',
                true,
                { content: [{ type: 'text', text: 'fetched' }] },
                { foo: 'bar' }
            );

            const serialized = original.toSerializable();
            expect(serialized.kind).to.equal('serverToolCall');

            const deserialized = await registry.deserialize(serialized);
            expect(ServerToolCallChatResponseContent.is(deserialized)).to.be.true;
            const restored = deserialized as ServerToolCallChatResponseContent;
            expect(restored.id).to.equal('call-1');
            expect(restored.name).to.equal('web_fetch');
            expect(restored.arguments).to.equal('{"url": "https://example.com"}');
            expect(restored.finished).to.be.true;
            expect(restored.result).to.deep.equal({ content: [{ type: 'text', text: 'fetched' }] });
            expect(restored.data).to.deep.equal({ foo: 'bar' });
        });
    });
});
