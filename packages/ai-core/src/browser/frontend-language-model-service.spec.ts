// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { LanguageModel, ReasoningSettings, ReasoningSupport, UserRequest } from '../common';
import { PREFERENCE_NAME_REASONING, ReasoningPreferenceEntry } from '../common/ai-core-preferences';
import { FrontendLanguageModelServiceImpl } from './frontend-language-model-service';

disableJSDOM();

const O_SERIES: ReasoningSupport = { supportedLevels: ['off', 'low', 'medium', 'high', 'auto'], defaultLevel: 'auto' };
const GPT5: ReasoningSupport = { supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'], defaultLevel: 'auto' };

/** Service with the trust check and the reasoning preference entries stubbed; nothing else in `sendRequest` needs a container. */
function createService(reasoningEntries: ReasoningPreferenceEntry[] = []): FrontendLanguageModelServiceImpl {
    const service = new FrontendLanguageModelServiceImpl();
    Object.assign(service, {
        workspaceTrustService: { getWorkspaceTrust: async () => true },
        aiConfiguration: { get: <T>(key: string, defaultValue?: T): T | undefined => key === PREFERENCE_NAME_REASONING ? reasoningEntries as unknown as T : defaultValue }
    });
    return service;
}

function createModel(id: string, reasoningSupport: ReasoningSupport | undefined, captured: UserRequest[]): LanguageModel {
    return {
        id,
        reasoningSupport,
        status: { status: 'ready' },
        request: async (request: UserRequest) => {
            captured.push(request);
            return { text: '' };
        }
    } as unknown as LanguageModel;
}

function createRequest(reasoning?: ReasoningSettings): UserRequest {
    return { messages: [{ actor: 'user', type: 'text', text: 'hello' }], agentId: 'agent', sessionId: 'session', requestId: 'request', reasoning };
}

describe('FrontendLanguageModelServiceImpl reasoning level', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('clamps a session-selected level the model does not support to the nearest supported one', async () => {
        const captured: UserRequest[] = [];
        await createService().sendRequest(createModel('openai/o3', O_SERIES, captured), createRequest({ level: 'minimal' }));
        expect(captured[0].reasoning).to.deep.equal({ level: 'low' });
    });

    it('clamps a preference-entry level the model does not support', async () => {
        const captured: UserRequest[] = [];
        const service = createService([{ scope: { providerId: 'openai' }, reasoning: { level: 'minimal' } }]);
        await service.sendRequest(createModel('openai/o3', O_SERIES, captured), createRequest());
        expect(captured[0].reasoning).to.deep.equal({ level: 'low' });
    });

    it('keeps a level the model supports', async () => {
        const captured: UserRequest[] = [];
        await createService().sendRequest(createModel('openai/gpt-5', GPT5, captured), createRequest({ level: 'minimal' }));
        expect(captured[0].reasoning).to.deep.equal({ level: 'minimal' });
    });

    it('leaves the level untouched for models without reasoning support', async () => {
        const captured: UserRequest[] = [];
        await createService().sendRequest(createModel('openai/gpt-4o', undefined, captured), createRequest({ level: 'high' }));
        expect(captured[0].reasoning).to.deep.equal({ level: 'high' });
    });
});
