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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { LanguageModel, LanguageModelRegistry, LanguageModelService, PromptService, UserRequest } from '@theia/ai-core';
import { CommitMessageAgent } from './commit-message-agent';
import { COMMIT_MESSAGE_SYSTEM_PROMPT_ID, COMMIT_MESSAGE_USER_PROMPT_ID } from './commit-message-prompt-template';

describe('CommitMessageAgent', () => {

    let container: Container;
    let agent: CommitMessageAgent;
    let registry: { selectLanguageModel: sinon.SinonStub };
    let promptService: { getResolvedPromptFragment: sinon.SinonStub; getPromptVariantInfo: sinon.SinonStub };
    let languageModelService: { sendRequest: sinon.SinonStub };
    const fakeModel = {} as LanguageModel;

    beforeEach(() => {
        container = new Container();
        registry = { selectLanguageModel: sinon.stub().resolves(fakeModel) };
        promptService = {
            getResolvedPromptFragment: sinon.stub().callsFake((id: string) => Promise.resolve({ text: `resolved:${id}` })),
            getPromptVariantInfo: sinon.stub().returns(undefined)
        };
        languageModelService = { sendRequest: sinon.stub().resolves({ text: 'feat: add thing\n' }) };

        container.bind(LanguageModelRegistry).toConstantValue(registry as unknown as LanguageModelRegistry);
        container.bind(PromptService).toConstantValue(promptService as unknown as PromptService);
        container.bind(LanguageModelService).toConstantValue(languageModelService as unknown as LanguageModelService);
        container.bind(CommitMessageAgent).toSelf();

        agent = container.get(CommitMessageAgent);
    });

    afterEach(() => sinon.restore());

    it('is a plain agent that exposes no functions', () => {
        expect(agent.functions).to.be.empty;
    });

    it('resolves both prompts, sends the request and returns the trimmed message', async () => {
        const result = await agent.generateCommitMessage('the diff', 'staged');

        expect(result).to.equal('feat: add thing');
        expect(promptService.getResolvedPromptFragment.calledWith(COMMIT_MESSAGE_SYSTEM_PROMPT_ID)).to.be.true;
        expect(promptService.getResolvedPromptFragment.calledWith(COMMIT_MESSAGE_USER_PROMPT_ID)).to.be.true;
        expect(languageModelService.sendRequest.calledOnce).to.be.true;
    });

    it('injects the diff and a human-readable scope into the prompt parameters', async () => {
        await agent.generateCommitMessage('the diff', 'all');

        const [, params] = promptService.getResolvedPromptFragment.firstCall.args;
        expect(params).to.deep.equal({ changes: 'the diff', scope: 'current' });
    });

    it('sends a system and a user message tagged with the agent id and the cancellation token', async () => {
        const token = { isCancellationRequested: false } as unknown as UserRequest['cancellationToken'];
        await agent.generateCommitMessage('the diff', 'staged', token);

        const request = languageModelService.sendRequest.firstCall.args[1] as UserRequest;
        expect(request.agentId).to.equal(agent.id);
        expect(request.cancellationToken).to.equal(token);
        expect(request.messages.map(m => m.actor)).to.deep.equal(['system', 'user']);
    });

    it('throws when no language model is available', async () => {
        registry.selectLanguageModel.resolves(undefined);

        const error = await agent.generateCommitMessage('the diff', 'staged').then(() => undefined, e => e);
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.match(/No language model/);
    });

    it('throws when the prompts cannot be resolved', async () => {
        promptService.getResolvedPromptFragment.resolves(undefined);

        const error = await agent.generateCommitMessage('the diff', 'staged').then(() => undefined, e => e);
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.match(/prompt service/);
    });
});
