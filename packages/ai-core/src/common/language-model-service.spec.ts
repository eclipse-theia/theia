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

import { expect } from 'chai';
import { LanguageModelServiceImpl } from './language-model-service';
import { LanguageModel, LanguageModelMessage, UserRequest } from './language-model';

describe('LanguageModelServiceImpl message filtering', () => {

    function createCapturingModel(): { model: LanguageModel; captured: () => LanguageModelMessage[] | undefined } {
        let capturedMessages: LanguageModelMessage[] | undefined;
        const model = {
            id: 'test',
            status: { status: 'ready' as const },
            async request(req: UserRequest): Promise<{ text: string }> {
                capturedMessages = req.messages;
                return { text: '' };
            }
        } as unknown as LanguageModel;
        return { model, captured: () => capturedMessages };
    }

    function baseMessages(): LanguageModelMessage[] {
        return [
            { actor: 'user', type: 'text', text: 'hi' },
            { actor: 'ai', type: 'tool_use', id: 't1', name: 'foo', input: {} },
            { actor: 'ai', type: 'server_tool_use', id: 's1', name: 'web_fetch', input: {} }
        ];
    }

    it('keeps server_tool_use messages when keepToolCalls is not disabled', async () => {
        const service = new LanguageModelServiceImpl();
        const { model, captured } = createCapturingModel();
        const request: UserRequest = { messages: baseMessages(), sessionId: 'session', requestId: 'req' };

        await service.sendRequest(model, request);

        expect(captured()!.some(m => m.type === 'server_tool_use')).to.be.true;
    });

    it('drops server_tool_use messages together with tool messages when keepToolCalls is false', async () => {
        const service = new LanguageModelServiceImpl();
        const { model, captured } = createCapturingModel();
        const request: UserRequest = {
            messages: baseMessages(),
            sessionId: 'session',
            requestId: 'req',
            clientSettings: { keepToolCalls: false, keepThinking: true }
        };

        await service.sendRequest(model, request);

        expect(captured()!.some(m => m.type === 'server_tool_use')).to.be.false;
        expect(captured()!.some(m => m.type === 'tool_use')).to.be.false;
        expect(captured()!.some(m => m.type === 'text')).to.be.true;
    });
});
