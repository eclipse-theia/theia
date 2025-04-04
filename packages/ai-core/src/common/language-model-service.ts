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

import {inject} from '@theia/core/shared/inversify';
import {LanguageModel, LanguageModelRegistry, LanguageModelResponse, UserRequest} from './language-model';
import {CommunicationRecordingService} from './communication-recording-service';

export const LanguageModelService = Symbol('LanguageModelService');

export interface LanguageModelService {
    /**
     * Submit a language model request in the context of the given `chatRequest`.
     */
    sendRequest(
        languageModel: LanguageModel,
        languageModelRequest: UserRequest
    ): Promise<LanguageModelResponse>;
}

export class LanguageModelServiceImpl implements LanguageModelService {

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

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

        return languageModel.request(languageModelRequest, languageModelRequest.cancellationToken);
    }

}
