// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import 'reflect-metadata';
import { expect } from 'chai';
import { LanguageModel, LanguageModelResponse, LanguageModelService, UserRequest } from '@theia/ai-core';
import { ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import { MutableChatModel, MutableChatRequestModel } from '@theia/ai-chat/lib/common/chat-model';
import { OrchestratorChatAgent } from './orchestrator-chat-agent';

class TestOrchestratorChatAgent extends OrchestratorChatAgent {
    constructor(onRequest: (request: UserRequest) => void) {
        super();
        this.languageModelService = {
            async sendRequest(_model: LanguageModel, request: UserRequest): Promise<LanguageModelResponse> {
                onRequest(request);
                return { text: '' };
            }
        } as unknown as LanguageModelService;
    }

    async sendLlmRequestForTest(request: MutableChatRequestModel): Promise<LanguageModelResponse> {
        return this.sendLlmRequest(request, [], [], undefined, { id: 'test-model' } as LanguageModel);
    }
}

function addRequest(model: MutableChatModel): MutableChatRequestModel {
    return model.addRequest({ request: { text: 'Hello' }, parts: [], toolRequests: new Map(), variables: [] });
}

describe('OrchestratorChatAgent.sendLlmRequest session metadata', () => {
    for (const parentSessionId of [undefined, 'parent-session']) {
        it(`forwards session metadata for ${parentSessionId ? 'a delegated' : 'a standalone'} chat`, async () => {
            let capturedRequest: UserRequest | undefined;
            const agent = new TestOrchestratorChatAgent(request => capturedRequest = request);
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            model.parentSessionId = parentSessionId;
            try {
                const request = addRequest(model);
                await agent.sendLlmRequestForTest(request);
                expect(capturedRequest).to.include({ sessionId: model.id, requestId: request.id, subRequestId: request.id });
                expect(capturedRequest!.parentSessionId).to.equal(parentSessionId);
            } finally {
                model.dispose();
            }
        });
    }

    it('preserves the dedicated subrequest identifier while forwarding parent metadata', async () => {
        let capturedRequest: UserRequest | undefined;
        const agent = new TestOrchestratorChatAgent(request => capturedRequest = request);
        const model = new MutableChatModel(ChatAgentLocation.Panel);
        model.parentSessionId = 'parent-session';
        try {
            const request = addRequest(model);
            request.addData('orchestratorRequestIdKey', 'orchestrator-subrequest');
            await agent.sendLlmRequestForTest(request);
            expect(capturedRequest).to.include({
                sessionId: model.id,
                parentSessionId: 'parent-session',
                requestId: request.id,
                subRequestId: 'orchestrator-subrequest'
            });
            expect(request.getDataByKey('orchestratorRequestIdKey')).to.equal(undefined);
        } finally {
            model.dispose();
        }
    });
});
