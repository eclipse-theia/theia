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

import { ChatResponseDelegate, ChatResponsePartDelegate, FrontendChatDelegateClient, ModelProviderFrontendDelegate } from '../common/chat-response-parts-delegate';
import { inject, injectable } from '@theia/core/shared/inversify';
import { generateUuid } from '@theia/core';
import { ChatRequestPart, LanguageModelProvider, isTextStreamChatResponsePart } from '../common';

@injectable()
export class ModelProviderFrontendDelegateImpl implements ModelProviderFrontendDelegate {

    @inject(LanguageModelProvider)
    private modelProvider: LanguageModelProvider;

    private frontendDelegateClient: FrontendChatDelegateClient;

    setClient(client: FrontendChatDelegateClient): void {
        this.frontendDelegateClient = client;
    }

    async sendRequest(messages: ChatRequestPart[]): Promise<ChatResponseDelegate> {
        const response = await this.modelProvider.sendRequest(messages);
        return response.map<ChatResponsePartDelegate>(responsePart => {
            if (isTextStreamChatResponsePart(responsePart)) {
                const mappedPart = {
                    type: 'text-stream-delegate',
                    id: generateUuid(),
                    format: responsePart.format
                };
                this.sendTokens(mappedPart.id, responsePart.stream);
                return mappedPart;
            }
            return responsePart;
        });
    }

    protected sendTokens(id: string, stream: AsyncIterable<string>): void {
        (async () => {
            for await (const token of stream) {
                this.frontendDelegateClient.send(id, token);
            }
            this.frontendDelegateClient.send(id, undefined);
        })();
    }
}
