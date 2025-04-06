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

import { inject } from '@theia/core/shared/inversify';
import { isLanguageModelStreamResponse, LanguageModel, LanguageModelRegistry, LanguageModelResponse, LanguageModelStreamResponsePart, UserRequest } from './language-model';
import { AiRequest, AiSession } from './language-model-interaction-model';
import { Emitter } from '@theia/core';

export interface RequestAddedEvent {
    type: 'requestAdded',
    id: string;
}
export interface ResponseCompletedEvent {
    type: 'responseCompleted',
    requestId: string;
}
export type SessionEvent = RequestAddedEvent | ResponseCompletedEvent;

export const LanguageModelService = Symbol('LanguageModelService');
export interface LanguageModelService {
    onSessionChanged: Emitter<SessionEvent>['event'];
    /**
     * Collection of all recorded AiSessions.
     */
    sessions: AiSession[];
    /**
     * Submit a language model request, it will automatically be recorded within an AiSession.
     */
    sendRequest(
        languageModel: LanguageModel,
        languageModelRequest: UserRequest
    ): Promise<LanguageModelResponse>;
}
export class LanguageModelServiceImpl implements LanguageModelService {

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    sessions: AiSession[] = [];

    protected sessionChangedEmitter = new Emitter<SessionEvent>();
    onSessionChanged = this.sessionChangedEmitter.event;

    async sendRequest(
        languageModel: LanguageModel,
        languageModelRequest: UserRequest
    ): Promise<LanguageModelResponse> {
        // Filter messages based on client settings
        languageModelRequest.messages = languageModelRequest.messages.filter(message => {
            if (message.type === 'thinking' && languageModelRequest.clientSettings?.keepThinking === false) {
                return false;
            }
            if ((message.type === 'tool_result' || message.type === 'tool_use') &&
                languageModelRequest.clientSettings?.keepToolCalls === false) {
                return false;
            }
            // Keep all other messages
            return true;
        });

        let response = await languageModel.request(languageModelRequest, languageModelRequest.cancellationToken);
        let storedResponse: AiRequest['response'];
        if (isLanguageModelStreamResponse(response)) {
            const parts: LanguageModelStreamResponsePart[] = [];
            response = {
                ...response,
                stream: createLoggingAsyncIterable(response.stream,
                    parts,
                    () => this.sessionChangedEmitter.fire({ type: 'responseCompleted', requestId: languageModelRequest.subRequestId ?? languageModelRequest.requestId }))
            };
            storedResponse = { parts };
        } else {
            storedResponse = response;
        }
        this.storeRequest(languageModel, languageModelRequest, storedResponse);

        return response;
    }

    protected storeRequest(languageModel: LanguageModel, languageModelRequest: UserRequest, response: AiRequest['response']): void {
        // Find or create the session for this request
        let session = this.sessions.find(s => s.id === languageModelRequest.sessionId);
        if (!session) {
            session = {
                id: languageModelRequest.sessionId,
                requests: []
            };
            this.sessions.push(session);
        }

        // Find or create the semantic request for this request
        let semanticRequest = session.requests.find(r => r.id === languageModelRequest.requestId);
        if (!semanticRequest) {
            semanticRequest = {
                id: languageModelRequest.requestId,
                requests: [],
                metadata: { agent: languageModelRequest.agentId }
            };
            session.requests.push(semanticRequest);
        }

        // Create and add the AI request to the semantic request
        const aiRequest: AiRequest = {
            id: languageModelRequest.subRequestId ?? languageModelRequest.requestId,
            request: languageModelRequest,
            languageModel: languageModel.id,
            response: response,
            metadata: {}
        };

        semanticRequest.requests.push(aiRequest);

        aiRequest.metadata.agent = languageModelRequest.agentId;
        aiRequest.metadata.timestamp = Date.now();

        this.sessionChangedEmitter.fire({ type: 'requestAdded', id: languageModelRequest.subRequestId ?? languageModelRequest.requestId });
    }

}

/**
 * Creates an AsyncIterable wrapper that stores each yielded item while preserving the
 * original AsyncIterable behavior.
 */
async function* createLoggingAsyncIterable(
    stream: AsyncIterable<LanguageModelStreamResponsePart>,
    parts: LanguageModelStreamResponsePart[],
    streamFinished: () => void
): AsyncIterable<LanguageModelStreamResponsePart> {
    try {
        for await (const part of stream) {
            parts.push(part);
            yield part;
        }
    } catch (error) {
        parts.push({ content: `[NOT FROM LLM] An error occured: ${error.message}` });
        throw error;
    } finally {
        streamFinished();
    }
}
