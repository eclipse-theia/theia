// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ImageContent, LanguageModelMessage } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { ChatCompletionAssistantMessageParam, ChatCompletionMessageParam } from 'openai/resources';
import { DeveloperMessageSettings } from './openai-language-model';
import { processSystemMessages } from './openai-response-api-utils';

/**
 * Utility class for processing messages for the OpenAI language model.
 *
 * Adopters can rebind this class to implement custom message processing behavior.
 */
@injectable()
export class OpenAiModelUtils {

    protected processSystemMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings
    ): LanguageModelMessage[] {
        return processSystemMessages(messages, developerMessageSettings);
    }

    protected toOpenAiRole(
        message: LanguageModelMessage,
        developerMessageSettings: DeveloperMessageSettings
    ): 'developer' | 'user' | 'assistant' | 'system' {
        if (message.actor === 'system') {
            if (developerMessageSettings === 'user' || developerMessageSettings === 'system' || developerMessageSettings === 'developer') {
                return developerMessageSettings;
            } else {
                return 'developer';
            }
        } else if (message.actor === 'ai') {
            return 'assistant';
        }
        return 'user';
    }

    protected toOpenAIMessage(
        message: LanguageModelMessage,
        developerMessageSettings: DeveloperMessageSettings
    ): ChatCompletionMessageParam {
        if (LanguageModelMessage.isTextMessage(message)) {
            return {
                role: this.toOpenAiRole(message, developerMessageSettings),
                content: message.text
            };
        }
        if (LanguageModelMessage.isToolUseMessage(message)) {
            return {
                role: 'assistant',
                tool_calls: [{ id: message.id, function: { name: message.name, arguments: JSON.stringify(message.input) }, type: 'function' }]
            };
        }
        if (LanguageModelMessage.isToolResultMessage(message)) {
            return {
                role: 'tool',
                tool_call_id: message.tool_use_id,
                // content only supports text content so we need to stringify any potential data we have, e.g., images
                content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
            };
        }
        if (LanguageModelMessage.isImageMessage(message) && message.actor === 'user') {
            return {
                role: 'user',
                content: [{
                    type: 'image_url',
                    image_url: {
                        url:
                            ImageContent.isBase64(message.image) ?
                                `data:${message.image.mimeType};base64,${message.image.base64data}` :
                                message.image.url
                    }
                }]
            };
        }
        throw new Error(`Unknown message type:'${JSON.stringify(message)}'`);
    }

    /**
     * Processes the provided list of messages by applying system message adjustments and converting
     * them to the format expected by the OpenAI API.
     *
     * Adopters can rebind this processing to implement custom behavior.
     *
     * @param messages the list of messages to process.
     * @param developerMessageSettings how system and developer messages are handled during processing.
     * @param model the OpenAI model identifier. Currently not used, but allows subclasses to implement model-specific behavior.
     * @returns an array of messages formatted for the OpenAI API.
     */
    processMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings,
        model?: string
    ): ChatCompletionMessageParam[] {
        const processed = this.processSystemMessages(messages, developerMessageSettings);
        const converted = processed.filter(m => m.type !== 'thinking').map(m => this.toOpenAIMessage(m, developerMessageSettings));
        return this.mergeConsecutiveAssistantMessages(converted);
    }

    protected mergeConsecutiveAssistantMessages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
        const result: ChatCompletionMessageParam[] = [];
        for (const message of messages) {
            const previous = result[result.length - 1];
            if (previous?.role === 'assistant' && message.role === 'assistant') {
                const merged: ChatCompletionAssistantMessageParam = { ...previous, role: 'assistant' };

                const previousContent = typeof previous.content === 'string' ? previous.content : undefined;
                const nextContent = typeof message.content === 'string' ? message.content : undefined;
                if (previousContent !== undefined && nextContent !== undefined) {
                    merged.content = `${previousContent}\n${nextContent}`;
                } else if (nextContent !== undefined) {
                    merged.content = nextContent;
                } else if (previousContent !== undefined) {
                    merged.content = previousContent;
                }

                const toolCalls = [...(previous.tool_calls ?? []), ...(message.tool_calls ?? [])];
                if (toolCalls.length > 0) {
                    merged.tool_calls = toolCalls;
                }

                result[result.length - 1] = merged;
            } else {
                result.push(message);
            }
        }
        return result;
    }
}
