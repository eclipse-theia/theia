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

/**
 * A deserializer for a specific kind of chat response content.
 *
 * Deserializers are responsible for reconstructing `ChatResponseContent` instances
 * from their serialized data representations. Each deserializer handles a single
 * content type identified by its `kind` property.
 *
 * @template T The type of the data object that this deserializer can process.
 *
 * @example
 * ```typescript
 * const textDeserializer: ChatContentDeserializer<TextContentData> = {
 *     kind: 'text',
 *     deserialize: (data) => new TextChatResponseContentImpl(data.content)
 * };
 * ```
 */
export interface ChatContentDeserializer<T = unknown> {
    /**
     * The unique identifier for the content type this deserializer handles.
     * This must match the `kind` property of the serialized content data.
     */
    readonly kind: string;

    /**
     * Deserializes the given data into a `ChatResponseContent` instance.
     *
     * @param data The serialized data to deserialize. The structure depends on the content kind.
     * @returns The deserialized content, or a Promise that resolves to the deserialized content.
     */
    deserialize(data: T): MaybePromise<ChatResponseContent>;
}

/**
 * Contribution point for registering chat content deserializers.
 *
 * Implement this interface to contribute custom deserializers for application-specific
 * or extension-specific chat response content types. Multiple contributions can be
 * registered, and all will be collected via the contribution provider pattern.
 *
 * @example
 * ```typescript
 * @injectable()
 * export class MyDeserializerContribution implements ChatContentDeserializerContribution {
 *     registerDeserializers(registry: ChatContentDeserializerRegistry): void {
 *         registry.register({
 *             kind: 'customContent',
 *             deserialize: (data: CustomContentData) =>
 *                 new CustomContentImpl(data.title, data.items)
 *         });
 *     }
 * }
 *
 * // In your module:
 * bind(ChatContentDeserializerContribution).to(MyDeserializerContribution).inSingletonScope();
 * ```
 *
 * @see {@link ChatContentDeserializerRegistry} for the registry that collects deserializers
 * @see {@link DefaultChatContentDeserializerContribution} for built-in content type deserializers
 */
export interface ChatContentDeserializerContribution {
    /**
     * Registers one or more deserializers with the provided registry.
     *
     * This method is called during the registry's initialization phase (at `@postConstruct()` time).
     *
     * @param registry The registry to register deserializers with
     */
    registerDeserializers(registry: ChatContentDeserializerRegistry): void;
}
export const ChatContentDeserializerContribution = Symbol('ChatContentDeserializerContribution');

/**
 * Registry for chat content deserializers.
 *
 * This registry maintains a collection of deserializers for different content types
 * and provides methods to register new deserializers and deserialize content data.
 *
 * @example
 * ```typescript
 * // Usage in a service:
 * @inject(ChatContentDeserializerRegistry)
 * protected deserializerRegistry: ChatContentDeserializerRegistry;
 *
 * async restoreContent(): Promise<void> {
 *     const restoredContent = this.deserializerRegistry.deserialize(serializedData);
 * }
 * ```
 *
 * @see {@link ChatContentDeserializerContribution} for how to contribute deserializers
 * @see {@link ChatContentDeserializerRegistryImpl} for the default implementation
 */
export interface ChatContentDeserializerRegistry {
    /**
     * Registers a deserializer for a specific content kind.
     *
     * If a deserializer for the same kind is already registered, it will be replaced.
     *
     * @param deserializer The deserializer to register
     */
    register(deserializer: ChatContentDeserializer<unknown>): void;

    /**
     * Deserializes the given serialized content data into a `ChatResponseContent` instance.
     *
     * The registry looks up the appropriate deserializer based on the `kind` property
     * of the serialized data and delegates to that deserializer's `deserialize` method.
     *
     * If no deserializer is found for the content kind, an `UnknownChatResponseContentImpl`
     * instance is returned with the original data and fallback message preserved.
     * A warning is also logged with the missing kind and available kinds.
     *
     * @param serialized The serialized content data to deserialize
     * @returns The deserialized content, or a Promise that resolves to the deserialized content
     */
    deserialize(serialized: SerializableChatResponseContentData): MaybePromise<ChatResponseContent>;
}
export const ChatContentDeserializerRegistry = Symbol('ChatContentDeserializerRegistry');

/**
 * Default implementation of the chat content deserializer registry.
 *
 * This registry collects deserializers from all bound `ChatContentDeserializerContribution`
 * instances during its post-construction initialization phase. Deserializers are stored
 * in a map keyed by their content kind.
 *
 * The registry handles unknown content types gracefully by returning an
 * `UnknownChatResponseContentImpl` instance when no deserializer is found,
 * ensuring that chat sessions can still be loaded even if some content types
 * are no longer supported or available.
 *
 * @see {@link ChatContentDeserializerRegistry} for the interface definition
 */
@injectable()
export class ChatContentDeserializerRegistryImpl implements ChatContentDeserializerRegistry {
    /**
     * Map of registered deserializers, keyed by content kind.
     */
    protected deserializers = new Map<string, ChatContentDeserializer>();

    @inject(ContributionProvider) @named(ChatContentDeserializerContribution)
    protected readonly deserializerContributions: ContributionProvider<ChatContentDeserializerContribution>;

    @inject(ILogger) @named('ChatContentDeserializerRegistry')
    protected readonly logger: ILogger;

    /**
     * Initializes the registry by collecting deserializers from all contributions.
     * This method is automatically called after construction due to the `@postConstruct` decorator.
     */
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
 * Default implementation of the chat content deserializer contribution.
 *
 * This contribution registers deserializers for all built-in content types supported
 * by Theia AI.
 *
 * Note that some content types have limitations when deserialized from persistence.
 *
 * @see {@link ChatContentDeserializerContribution} for the contribution interface
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
