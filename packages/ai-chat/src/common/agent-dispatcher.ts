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
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    LanguageModelProviderRegistry,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelStreamResponsePart,
} from '@theia/ai-core';
import { ILogger, isArray } from '@theia/core';
import {
    ChatRequestModelImpl,
    ChatResponseContent,
    CommandChatResponseContentImpl,
    isCommandChatResponseContent,
    // TextChatResponseContentImpl,
    MarkdownChatResponseContentImpl
} from './chat-model';
import { getMessages } from './chat-util';

export const AgentDispatcher = Symbol('AgentDispatcher');
export interface AgentDispatcher {
    performRequest(request: ChatRequestModelImpl): Promise<void>;
}

@injectable()
export class AgentDispatcherImpl implements AgentDispatcher {
    @inject(LanguageModelProviderRegistry)
    modelProviderRegistry: LanguageModelProviderRegistry;

    @inject(ILogger)
    protected logger: ILogger;

    async performRequest(request: ChatRequestModelImpl): Promise<void> {
        // TODO implement agent delegation
        const languageModelResponse = await (
            await this.modelProviderRegistry.getLanguageModelProviders()
        )[0].request({ messages: getMessages(request.session) });
        if (isLanguageModelTextResponse(languageModelResponse)) {
            request.response.response.addContent(
                new MarkdownChatResponseContentImpl(languageModelResponse.text)
            );
            request.response.complete();
            return;
        }
        if (isLanguageModelStreamResponse(languageModelResponse)) {
            for await (const token of languageModelResponse.stream) {
                const newContents = this.parse(token, request.response.response.content);
                if (isArray(newContents)) {
                    newContents.forEach(request.response.response.addContent);
                } else {
                    request.response.response.addContent(newContents);
                }
            }
            request.response.complete();
            return;
        }
        this.logger.error(
            'Received unknown response in agent. Return response as text'
        );
        request.response.response.addContent(
            new MarkdownChatResponseContentImpl(
                JSON.stringify(languageModelResponse)
            )
        );
        request.response.complete();
    }

    private parse(token: LanguageModelStreamResponsePart, previousContent: ChatResponseContent[]): ChatResponseContent | ChatResponseContent[] {
        if (token.tool_calls) {
            const previousCommands = previousContent.filter(isCommandChatResponseContent);
            const newTools = token.tool_calls.filter(tc => tc.function && tc.function.name && previousCommands.find(c => c.command.id === tc.function?.name) === undefined);
            return newTools.map(t => new CommandChatResponseContentImpl({ id: t.function!.name! }, t.function!.arguments ? JSON.parse(t.function!.arguments) : undefined));
        }
        return new MarkdownChatResponseContentImpl(token.content ?? '');
    }
}
