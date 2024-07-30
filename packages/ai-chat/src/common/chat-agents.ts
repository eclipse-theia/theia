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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Partially copied from https://github.com/microsoft/vscode/blob/a2cab7255c0df424027be05d58e1b7b941f4ea60/src/vs/workbench/contrib/chat/common/chatAgents.ts

import { CommunicationRecordingService } from '@theia/ai-core';
import {
    Agent,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    LanguageModelRegistry,
    LanguageModelSelector,
    LanguageModelStreamResponsePart,
    PromptTemplate
} from '@theia/ai-core/lib/common';
import { generateUuid, ILogger, isArray } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatRequestModelImpl, ChatResponseContent, MarkdownChatResponseContentImpl } from './chat-model';
import { getMessages } from './chat-util';

export namespace ChatAgentLocation {
    export function fromRaw(value: string): ChatAgentLocation {
        switch (value) {
            case 'panel': return ChatAgentLocation.Panel;
            case 'terminal': return ChatAgentLocation.Terminal;
            case 'notebook': return ChatAgentLocation.Notebook;
            case 'editor': return ChatAgentLocation.Editor;
        }
        return ChatAgentLocation.Panel;
    }
}
export enum ChatAgentLocation {
    Panel = 'panel',
    Terminal = 'terminal',
    Notebook = 'notebook',
    Editor = 'editor'
}

export interface ChatAgentData extends Agent {
    locations: ChatAgentLocation[];
}

export const ChatAgent = Symbol('ChatAgent');
export interface ChatAgent extends ChatAgentData {
    invoke(request: ChatRequestModelImpl): Promise<void>;
}
@injectable()
export class DefaultChatAgent implements ChatAgent {
    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(ILogger)
    protected logger: ILogger;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    id: string = 'DefaultChatAgent';
    name: string = 'Default Chat Agent';
    description: string = 'The default chat agent provided by Theia.';
    variables: string[] = [];
    promptTemplates: PromptTemplate[] = [];
    // FIXME: placeholder values
    languageModelRequirements: Omit<LanguageModelSelector, 'agent'>[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }];
    locations: ChatAgentLocation[] = [];

    async invoke(request: ChatRequestModelImpl): Promise<void> {
        this.recordingService.recordRequest({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.id,
            request: request.request.text
        });
        const selector = this.languageModelRequirements.find(req => req.purpose === 'chat')!;
        const languageModels = await this.languageModelRegistry.selectLanguageModels({ agent: this.id, ...selector });
        if (languageModels.length === 0) {
            throw new Error('Couldn\'t find a language model. Please check your setup!');
        }
        const languageModelResponse = await languageModels[0].request({ messages: getMessages(request.session) });
        if (isLanguageModelTextResponse(languageModelResponse)) {
            request.response.response.addContent(
                new MarkdownChatResponseContentImpl(languageModelResponse.text)
            );
            request.response.complete();
            this.recordingService.recordResponse({
                agentId: this.id,
                sessionId: request.session.id,
                timestamp: Date.now(),
                requestId: request.response.requestId,
                response: request.response.response.asString()
            });
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
            this.recordingService.recordResponse({
                agentId: this.id,
                sessionId: request.session.id,
                timestamp: Date.now(),
                requestId: request.response.requestId,
                response: request.response.response.asString()
            });
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
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.response.requestId,
            response: request.response.response.asString()
        });
    }

    private parse(token: LanguageModelStreamResponsePart, previousContent: ChatResponseContent[]): ChatResponseContent | ChatResponseContent[] {
        // TODO does it make sense to add it here? This code breaks the parsing
        // if (token.tool_calls) {
        //     const previousCommands = previousContent.filter(isCommandChatResponseContent);
        //     const newTools = token.tool_calls.filter(tc => tc.function && tc.function.name && previousCommands.find(c => c.command.id === tc.function?.name) === undefined);
        //     return newTools.map(t => new CommandChatResponseContentImpl({ id: t.function!.name! }, t.function!.arguments ? JSON.parse(t.function!.arguments) : undefined));
        // }
        return new MarkdownChatResponseContentImpl(token.content ?? '');
    }
}

@injectable()
export class DummyChatAgent implements ChatAgent {

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    id: string = 'DummyChatAgent';
    name: string = 'Dummy Chat Agent';
    description: string = 'The dummy chat agent provided by ES.';
    variables: string[] = [];
    promptTemplates: PromptTemplate[] = [];
    languageModelRequirements: Omit<LanguageModelSelector, 'agentId'>[] = [];
    locations: ChatAgentLocation[] = [];

    async invoke(request?: ChatRequestModelImpl): Promise<void> {
        const requestUuid = generateUuid();
        const sessionId = 'dummy-session';
        this.recordingService.recordRequest({
            agentId: this.id,
            sessionId: sessionId,
            timestamp: Date.now(),
            requestId: requestUuid,
            request: 'Dummy request'
        });
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId: sessionId,
            timestamp: Date.now(),
            requestId: requestUuid,
            response: 'Dummy response'
        });
    }
}
