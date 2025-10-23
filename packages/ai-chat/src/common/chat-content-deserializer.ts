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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import {
    ChatResponseContent,
    CodeChatResponseContentImpl,
    CommandChatResponseContentImpl,
    ErrorChatResponseContentImpl,
    HorizontalLayoutChatResponseContentImpl,
    InformationalChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
    ProgressChatResponseContentImpl,
    QuestionResponseContentImpl,
    TextChatResponseContentImpl,
    ThinkingChatResponseContentImpl,
    ToolCallChatResponseContentImpl,
    UnknownChatResponseContentImpl,
    TextContentData,
    ThinkingContentData,
    MarkdownContentData,
    InformationalContentData,
    CodeContentData,
    ToolCallContentData,
    CommandContentData,
    HorizontalLayoutContentData,
    ProgressContentData,
    ErrorContentData,
    QuestionContentData
} from './chat-model';
import { SerializableChatResponseContentData } from './chat-model-serialization';
import { ContributionProvider, ILogger, MaybePromise } from '@theia/core';

export const ChatContentDeserializer = Symbol('ChatContentDeserializer');

export interface ChatContentDeserializer<T = unknown> {
    readonly kind: string;
    deserialize(data: T): MaybePromise<ChatResponseContent>;
}

export interface ChatContentDeserializerContribution {
    registerDeserializers(registry: ChatContentDeserializerRegistry): void;
}
export const ChatContentDeserializerContribution = Symbol('ChatContentDeserializerContribution');

export interface ChatContentDeserializerRegistry {
    register(deserializer: ChatContentDeserializer<unknown>): void;
    deserialize(serialized: SerializableChatResponseContentData): MaybePromise<ChatResponseContent>;
}
export const ChatContentDeserializerRegistry = Symbol('ChatContentDeserializerRegistry');

/**
 * Registry for chat content deserializers.
 */
@injectable()
export class ChatContentDeserializerRegistryImpl implements ChatContentDeserializerRegistry {
    protected deserializers = new Map<string, ChatContentDeserializer>();

    @inject(ContributionProvider) @named(ChatContentDeserializerContribution)
    protected readonly deserializerContributions: ContributionProvider<ChatContentDeserializerContribution>;

    @inject(ILogger) @named('ChatContentDeserializerRegistry')
    protected readonly logger: ILogger;

    @postConstruct()
    protected initDeserializers(): void {
        for (const contribution of this.deserializerContributions.getContributions()) {
            contribution.registerDeserializers(this);
        }
    }

    register(deserializer: ChatContentDeserializer): void {
        this.deserializers.set(deserializer.kind, deserializer);
    }

    deserialize(serialized: SerializableChatResponseContentData): MaybePromise<ChatResponseContent> {
        const deserializer = this.deserializers.get(serialized.kind);
        if (!deserializer) {
            this.logger.warn('No deserializer found for kind:', serialized.kind, 'Available kinds:', Array.from(this.deserializers.keys()));
            return new UnknownChatResponseContentImpl(
                serialized.kind,
                serialized.fallbackMessage,
                serialized.data
            );
        }
        return deserializer.deserialize(serialized.data);
    }
}

/**
 * Default implementation of the deserializer contribution.
 * Registers deserializers for all built-in content types.
 */
@injectable()
export class DefaultChatContentDeserializerContribution implements ChatContentDeserializerContribution {
    registerDeserializers(registry: ChatContentDeserializerRegistry): void {
        registry.register({
            kind: 'text',
            deserialize: (data: TextContentData) => new TextChatResponseContentImpl(data.content)
        });

        registry.register({
            kind: 'thinking',
            deserialize: (data: ThinkingContentData) => new ThinkingChatResponseContentImpl(
                data.content,
                data.signature
            )
        });

        registry.register({
            kind: 'markdownContent',
            deserialize: (data: MarkdownContentData) => new MarkdownChatResponseContentImpl(data.content)
        });

        registry.register({
            kind: 'informational',
            deserialize: (data: InformationalContentData) => new InformationalChatResponseContentImpl(data.content)
        });

        registry.register({
            kind: 'code',
            deserialize: (data: CodeContentData) => new CodeChatResponseContentImpl(
                data.code,
                data.language,
                data.location
            )
        });

        registry.register({
            kind: 'toolCall',
            deserialize: (data: ToolCallContentData) => new ToolCallChatResponseContentImpl(
                data.id,
                data.name,
                data.arguments,
                data.finished,
                data.result
            )
        });

        registry.register({
            kind: 'command',
            deserialize: (data: CommandContentData) => {
                const command = data.commandId ? { id: data.commandId } : undefined;
                // Cannot restore customCallback since it contains a function
                return new CommandChatResponseContentImpl(command, undefined, data.arguments);
            }
        });

        registry.register({
            kind: 'horizontal',
            deserialize: async (data: HorizontalLayoutContentData) => {
                const childContentPromises = data.content.map(child => registry.deserialize(child));
                const childContent = Promise.all(childContentPromises);
                return new HorizontalLayoutChatResponseContentImpl(await childContent);
            }
        });

        registry.register({
            kind: 'progress',
            deserialize: (data: ProgressContentData) => new ProgressChatResponseContentImpl(data.message)
        });

        registry.register({
            kind: 'error',
            deserialize: (data: ErrorContentData) => {
                const error = new Error(data.message);
                if (data.stack) {
                    error.stack = data.stack;
                }
                return new ErrorChatResponseContentImpl(error);
            }
        });

        registry.register({
            kind: 'question',
            deserialize: (data: QuestionContentData) =>
                // Restore in read-only mode (no handler/request)
                new QuestionResponseContentImpl(
                    data.question,
                    data.options,
                    undefined,
                    undefined,
                    data.selectedOption
                )
        });
    }
}
