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
} from '@theia/ai-model-provider';
import { ILogger } from '@theia/core';
import {
    ChatRequestModelImpl,
    TextChatResponseContentImpl,
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
                new TextChatResponseContentImpl(languageModelResponse.text)
            );
            request.response.complete();
            return;
        }
        if (isLanguageModelStreamResponse(languageModelResponse)) {
            for await (const token of languageModelResponse.stream) {
                request.response.response.addContent(
                    new TextChatResponseContentImpl(token)
                );
            }
            request.response.complete();
            return;
        }
        this.logger.error(
            'Received unknown response in agent. Return response as text'
        );
        request.response.response.addContent(
            new TextChatResponseContentImpl(
                JSON.stringify(languageModelResponse)
            )
        );
        request.response.complete();
    }
}
