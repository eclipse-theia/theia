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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import 'reflect-metadata';
import { expect } from 'chai';
import { MutableChatRequestModel } from '@theia/ai-chat';
import { PromptService, ResolvedPromptFragment } from '@theia/ai-core';
import { ClaudeCodeChatAgent, ideContextTemplate, systemPromptAppendixTemplate } from './claude-code-chat-agent';
disableJSDOM();

/** Substitutes `{{name}}` from args, `{{selectedText}}` with a fixed value, so the wiring (not PromptService) is under test. */
class FakePromptService {
    readonly templates = new Map<string, string>([
        [systemPromptAppendixTemplate.id, systemPromptAppendixTemplate.template],
        [ideContextTemplate.id, ideContextTemplate.template]
    ]);
    async getResolvedPromptFragment(id: string, args?: Record<string, unknown>): Promise<ResolvedPromptFragment | undefined> {
        let text = this.templates.get(id);
        if (text === undefined) {
            return undefined;
        }
        text = text.replace('{{selectedText}}', 'SELECTED').replace('{{productName}}', 'Theia');
        for (const [key, value] of Object.entries(args ?? {})) {
            text = text.replace(`{{${key}}}`, String(value));
        }
        return { id, text };
    }
}

class TestableClaudeCodeChatAgent extends ClaudeCodeChatAgent {
    constructor() {
        super();
        this.promptService = new FakePromptService() as unknown as PromptService;
        (this as unknown as { editorManager: unknown }).editorManager = {
            currentEditor: { editor: { document: { uri: 'file:///ws/active.ts' } } },
            all: [{ editor: { document: { uri: 'file:///ws/active.ts' } } }, { editor: { document: { uri: 'file:///ws/other.ts' } } }]
        };
    }
    exposeCreateIdeContext(request: MutableChatRequestModel): Promise<ResolvedPromptFragment | undefined> {
        return this.createIdeContext(request, this.collectIdeContextArgs(request));
    }
    exposeCreateSystemPromptAppendix(request: MutableChatRequestModel): Promise<ResolvedPromptFragment | undefined> {
        return this.createSystemPromptAppendix(request, this.collectIdeContextArgs(request));
    }
    exposeBuildPrompt(request: MutableChatRequestModel, ideContext: ResolvedPromptFragment | undefined): string {
        return this.buildPrompt(request, ideContext);
    }
    setAppendixTemplate(text: string): void {
        (this.promptService as unknown as FakePromptService).templates.set(systemPromptAppendixTemplate.id, text);
    }
}

function fakeRequest(text: string): MutableChatRequestModel {
    return {
        request: { text },
        context: { variables: [{ variable: { id: 'file', name: 'file', description: '' }, arg: 'src/a.ts', value: '', contextValue: '' }] },
        session: { context: { getVariables: () => [] } }
    } as unknown as MutableChatRequestModel;
}

describe('ClaudeCodeChatAgent IDE context', () => {
    let agent: TestableClaudeCodeChatAgent;
    beforeEach(() => { agent = new TestableClaudeCodeChatAgent(); });

    it('keeps the system prompt appendix free of volatile editor state', async () => {
        const appendix = await agent.exposeCreateSystemPromptAppendix(fakeRequest('hi'));
        expect(appendix?.text).to.contain('IDE Integration Context').and.to.contain('<ide-context>');
        for (const volatile of ['SELECTED', 'file:///ws/active.ts', 'file:///ws/other.ts', 'src/a.ts', '{{']) {
            expect(appendix?.text).not.to.contain(volatile);
        }
    });

    it('resolves the per-turn ide-context block with selection, active editor, open editors and context files', async () => {
        const ideContext = await agent.exposeCreateIdeContext(fakeRequest('hi'));
        expect(ideContext?.text.trim().startsWith('<ide-context>')).to.equal(true);
        expect(ideContext?.text.trim().endsWith('</ide-context>')).to.equal(true);
        expect(ideContext?.text).to.contain('SELECTED').and.to.contain('file:///ws/active.ts').and.to.contain('- file:///ws/other.ts').and.to.contain('- src/a.ts');
        // State only: the usage guidance stays in the stable appendix.
        expect(ideContext?.text).not.to.contain('prioritize');
    });

    it('still resolves an adopter-customized appendix that keeps a volatile placeholder like {{activeEditor}}', async () => {
        agent.setAppendixTemplate(systemPromptAppendixTemplate.template + '\n{{activeEditor}}');

        const appendix = await agent.exposeCreateSystemPromptAppendix(fakeRequest('hi'));

        expect(appendix?.text).to.contain('file:///ws/active.ts');
        expect(appendix?.text).not.to.contain('{{activeEditor}}');
    });

    it('prepends the block to the user prompt after stripping the agent mention', () => {
        const prompt = agent.exposeBuildPrompt(fakeRequest('@ClaudeCode fix it'), { id: ideContextTemplate.id, text: '<ide-context>x</ide-context>' });
        expect(prompt).to.equal('<ide-context>x</ide-context>\n\nfix it');
        expect(agent.exposeBuildPrompt(fakeRequest('fix it'), undefined)).to.equal('fix it');
    });
});
