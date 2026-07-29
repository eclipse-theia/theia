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
import { OpenAiModelDescription } from '../common';
import { OpenAiLanguageModelsManagerImpl } from './openai-language-models-manager-impl';
import { OPENAI_SERVER_TOOLS, OPENAI_WEB_SEARCH } from './openai-server-tools';

class TestableOpenAiLanguageModelsManagerImpl extends OpenAiLanguageModelsManagerImpl {
    resolveServerToolsForTest(description: OpenAiModelDescription): typeof OPENAI_SERVER_TOOLS | undefined {
        return this.resolveServerTools(description);
    }
}

function modelDescription(overrides: Partial<OpenAiModelDescription> = {}): OpenAiModelDescription {
    return {
        id: 'openai/gpt-5',
        model: 'gpt-5',
        apiKey: true,
        apiVersion: undefined,
        maxRetries: 3,
        ...overrides
    };
}

describe('OpenAiLanguageModelsManagerImpl server tools', () => {
    const manager = new TestableOpenAiLanguageModelsManagerImpl();

    it('offers native web search for Response API models using the OpenAI endpoint', () => {
        const serverTools = manager.resolveServerToolsForTest(modelDescription({ useResponseApi: true }));
        expect(serverTools?.some(tool => tool.id === OPENAI_WEB_SEARCH)).to.equal(true);
    });

    it('does not offer native web search for custom endpoints', () => {
        expect(manager.resolveServerToolsForTest(modelDescription({
            useResponseApi: true,
            url: 'https://example.com/v1'
        }))).to.equal(undefined);
    });

    it('does not offer native web search without the Response API', () => {
        expect(manager.resolveServerToolsForTest(modelDescription())).to.equal(undefined);
    });
});
