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
import { URI } from '@theia/core';
import { Position } from '@theia/core/shared/vscode-languageserver-protocol';
import { ILogger } from '@theia/core/lib/common';
import {
    ChatContentDeserializerRegistryImpl,
    DefaultChatContentDeserializerContribution
} from './chat-content-deserializer';
import {
    CodeChatResponseContentImpl,
    ErrorChatResponseContentImpl,
    HorizontalLayoutChatResponseContentImpl,
    InformationalChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
    ProgressChatResponseContentImpl,
    QuestionResponseContentImpl,
    TextChatResponseContentImpl,
    ThinkingChatResponseContentImpl,
    ToolCallChatResponseContentImpl
} from './chat-model';

class MockLogger {
    error(): void { }
    warn(): void { }
    info(): void { }
    debug(): void { }
}

describe('Chat Content Serialization', () => {

    let registry: ChatContentDeserializerRegistryImpl;

    beforeEach(() => {
        registry = new ChatContentDeserializerRegistryImpl();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (registry as any).logger = new MockLogger() as unknown as ILogger;
        const contribution = new DefaultChatContentDeserializerContribution();
        contribution.registerDeserializers(registry);
    });

    describe('TextChatResponseContentImpl', () => {
        it('should serialize and deserialize correctly', async () => {
            const original = new TextChatResponseContentImpl('Hello, World!');
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('text');
            expect(serialized!.data).to.deep.equal({ content: 'Hello, World!' });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('text');
            expect(deserialized.asString?.()).to.equal('Hello, World!');
        });
    });

    describe('ThinkingChatResponseContentImpl', () => {
        it('should serialize and deserialize correctly', async () => {
            const original = new ThinkingChatResponseContentImpl('Thinking...', 'sig123');
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('thinking');
            expect(serialized!.data).to.deep.equal({
                content: 'Thinking...',
                signature: 'sig123'
            });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('thinking');
        });
    });

    describe('MarkdownChatResponseContentImpl', () => {
        it('should serialize and deserialize correctly', async () => {
            const original = new MarkdownChatResponseContentImpl('# Title\n\nContent');
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('markdownContent');
            expect(serialized!.data).to.deep.equal({ content: '# Title\n\nContent' });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('markdownContent');
            expect(deserialized.asString?.()).to.equal('# Title\n\nContent');
        });
    });

    describe('InformationalChatResponseContentImpl', () => {
        it('should serialize and deserialize correctly', async () => {
            const original = new InformationalChatResponseContentImpl('Info message');
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('informational');
            expect(serialized!.data).to.deep.equal({ content: 'Info message' });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('informational');
        });
    });

    describe('CodeChatResponseContentImpl', () => {
        it('should serialize and deserialize code without location', async () => {
            const original = new CodeChatResponseContentImpl('console.log("test")', 'typescript');
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('code');
            expect(serialized!.data).to.deep.equal({
                code: 'console.log("test")',
                language: 'typescript',
                location: undefined
            });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('code');
        });

        it('should serialize and deserialize code with location', async () => {
            const location = {
                uri: new URI('file:///test.ts'),
                position: Position.create(1, 0)
            };
            const original = new CodeChatResponseContentImpl('code', 'typescript', location);
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('code');

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('code');
        });
    });

    describe('ToolCallChatResponseContentImpl', () => {
        it('should serialize and deserialize correctly', async () => {
            const original = new ToolCallChatResponseContentImpl(
                'id123',
                'toolName',
                '{"arg": "value"}',
                true,
                'result'
            );
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('toolCall');
            expect(serialized!.data).to.deep.equal({
                id: 'id123',
                name: 'toolName',
                arguments: '{"arg": "value"}',
                finished: true,
                result: 'result'
            });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('toolCall');
        });
    });

    describe('ErrorChatResponseContentImpl', () => {
        it('should serialize and deserialize correctly', async () => {
            const error = new Error('Test error');
            const original = new ErrorChatResponseContentImpl(error);
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('error');
            expect(serialized!.data).to.have.property('message', 'Test error');

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('error');
        });
    });

    describe('ProgressChatResponseContentImpl', () => {
        it('should serialize and deserialize correctly', async () => {
            const original = new ProgressChatResponseContentImpl('Processing...');
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('progress');
            expect(serialized!.data).to.deep.equal({ message: 'Processing...' });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('progress');
        });
    });

    describe('HorizontalLayoutChatResponseContentImpl', () => {
        it('should serialize and deserialize nested content', async () => {
            const child1 = new TextChatResponseContentImpl('Text 1');
            const child2 = new TextChatResponseContentImpl('Text 2');
            const original = new HorizontalLayoutChatResponseContentImpl([child1, child2]);
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('horizontal');
            expect(serialized!.data).to.have.property('content');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((serialized!.data as any).content).to.be.an('array').with.length(2);

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('horizontal');
        });
    });

    describe('QuestionResponseContentImpl', () => {
        it('should serialize and deserialize question with selected option', async () => {
            const options = [
                { text: 'Blue' },
                { text: 'Green' },
                { text: 'Lavender' }
            ];
            const original = new QuestionResponseContentImpl(
                'Which color do you find most calming?',
                options,
                undefined, // request
                undefined, // handler
                { text: 'Blue' } // selectedOption
            );
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('question');
            expect(serialized!.data).to.deep.equal({
                question: 'Which color do you find most calming?',
                options: options,
                selectedOption: { text: 'Blue' }
            });

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('question');
            expect(deserialized.asString?.()).to.include('Question: Which color do you find most calming?');
            expect(deserialized.asString?.()).to.include('Answer: Blue');
        });

        it('should serialize and deserialize question without selected option', async () => {
            const options = [
                { text: 'Option 1' },
                { text: 'Option 2' }
            ];
            const original = new QuestionResponseContentImpl(
                'What is your choice?',
                options,
                undefined, // request
                undefined  // handler
                // no selectedOption
            );
            const serialized = original.toSerializable?.();

            expect(serialized).to.not.be.undefined;
            expect(serialized!.kind).to.equal('question');

            // Simulate caller populating fallbackMessage
            const withFallback = {
                ...serialized!,
                fallbackMessage: original.asString?.() || original.toString()
            };

            const deserialized = await registry.deserialize(withFallback);
            expect(deserialized.kind).to.equal('question');
            expect(deserialized.asString?.()).to.include('Question: What is your choice?');
            expect(deserialized.asString?.()).to.include('No answer');
        });
    });

    describe('ChatContentDeserializerRegistry', () => {
        it('should handle unknown content types with fallback', async () => {
            const unknownContent = {
                kind: 'unknown-type',
                fallbackMessage: 'Fallback text',
                data: { some: 'data' }
            };

            const deserialized = await registry.deserialize(unknownContent);
            expect(deserialized.kind).to.equal('unknown');
            expect(deserialized.asString?.()).to.equal('Fallback text');
        });

        it('should use fallback message when deserializer not found', async () => {
            const unknownContent = {
                kind: 'custom-extension-type',
                fallbackMessage: 'Custom content not available',
                data: undefined
            };

            const deserialized = await registry.deserialize(unknownContent);
            expect(deserialized.asString?.()).to.equal('Custom content not available');
        });
    });

});
