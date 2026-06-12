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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { ILogger, MessageService } from '@theia/core';
import { ChatRequestParser } from '@theia/ai-chat/lib/common/chat-request-parser';
import {
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    TextChatResponseContentImpl,
    ThinkingChatResponseContentImpl,
    ToolCallChatResponseContentImpl
} from '@theia/ai-chat/lib/common/chat-model';
import { ParsedChatRequest, ParsedChatRequestTextPart } from '@theia/ai-chat/lib/common/parsed-chat-request';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmInput } from '@theia/scm/lib/browser/scm-input';
import { CommitMessageAgent, COMMIT_MESSAGE_AGENT_ID } from './commit-message-agent';
import { CommitMessageRunner } from './commit-message-runner';
import { GET_GIT_CHANGES_FUNCTION_ID } from './git-changes-tool';

disableJSDOM();

interface MockRepository {
    input: ScmInput;
}

function createParsedRequest(text: string): ParsedChatRequest {
    return {
        request: { text },
        parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text)],
        toolRequests: new Map(),
        variables: []
    };
}

describe('CommitMessageRunner', () => {

    let container: Container;
    let runner: CommitMessageRunner;
    let agent: { id: string; invoke: sinon.SinonStub };
    let scmService: { selectedRepository: MockRepository | undefined };
    let messageService: {
        warn: sinon.SinonStub;
        error: sinon.SinonStub;
        info: sinon.SinonStub;
    };
    let parser: { parseChatRequest: sinon.SinonStub };
    let confirmationManager: { getConfirmationMode: sinon.SinonStub; setConfirmationMode: sinon.SinonStub };
    let logger: { error: sinon.SinonStub; warn: sinon.SinonStub; info: sinon.SinonStub; debug: sinon.SinonStub; trace: sinon.SinonStub };
    let repository: MockRepository;
    let focusSpy: sinon.SinonSpy;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();

        const input = new ScmInput();
        focusSpy = sinon.spy(input, 'focus');
        repository = { input };

        scmService = { selectedRepository: repository };
        agent = { id: COMMIT_MESSAGE_AGENT_ID, invoke: sinon.stub() };
        messageService = {
            warn: sinon.stub().resolves(undefined),
            error: sinon.stub().resolves(undefined),
            info: sinon.stub().resolves(undefined)
        };
        parser = {
            parseChatRequest: sinon.stub().callsFake((req: { text: string }) => Promise.resolve(createParsedRequest(req.text)))
        };
        // Default the mock to ALWAYS_ALLOW so the existing happy-path tests do not have to mock
        // the gate dialog. Tests that exercise the gate explicitly override this in the test body.
        confirmationManager = {
            getConfirmationMode: sinon.stub().returns(ToolConfirmationMode.ALWAYS_ALLOW),
            setConfirmationMode: sinon.stub().resolves()
        };
        logger = {
            error: sinon.stub(),
            warn: sinon.stub(),
            info: sinon.stub(),
            debug: sinon.stub(),
            trace: sinon.stub()
        };

        container.bind(CommitMessageAgent).toConstantValue(agent as unknown as CommitMessageAgent);
        container.bind(ChatRequestParser).toConstantValue(parser as unknown as ChatRequestParser);
        container.bind(ScmService).toConstantValue(scmService as unknown as ScmService);
        container.bind(MessageService).toConstantValue(messageService as unknown as MessageService);
        container.bind(ToolConfirmationManager).toConstantValue(confirmationManager as unknown as ToolConfirmationManager);
        container.bind(ILogger).toConstantValue(logger as unknown as ILogger);
        container.bind(CommitMessageRunner).toSelf();

        runner = container.get(CommitMessageRunner);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('writes the response text into the SCM input and focuses it on success', async () => {
        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            request.response.response.addContent(new TextChatResponseContentImpl('feat: add new thing'));
            request.response.complete();
        });

        await runner.run('staged');

        expect(repository.input.value).to.equal('feat: add new thing');
        expect(focusSpy.calledOnce).to.be.true;
        expect(messageService.error.called).to.be.false;
    });

    it('preserves markdown content (some models stream the answer as markdownContent)', async () => {
        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            request.response.response.addContent(new MarkdownChatResponseContentImpl('chore: bump version'));
            request.response.complete();
        });

        await runner.run('all');

        expect(repository.input.value).to.equal('chore: bump version');
    });

    it('filters out thinking and tool-call content from the response', async () => {
        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            // Reproduces the user-reported bug where models with extended thinking emit a
            // ThinkingChatResponseContent whose asString() serializes as JSON, which the
            // aggregated ChatResponse.asString() would have inlined into the commit message.
            request.response.response.addContent(new ThinkingChatResponseContentImpl(
                'The user is asking for a commit message for staged changes...',
                'sig-abc'
            ));
            request.response.response.addContent(new ToolCallChatResponseContentImpl(
                'call-1', 'getGitChanges', '{"stagedOnly":true}'
            ));
            request.response.response.addContent(new TextChatResponseContentImpl(
                'fix: correct dev server port from 9324 to 9323'
            ));
            request.response.complete();
        });

        await runner.run('staged');

        expect(repository.input.value).to.equal('fix: correct dev server port from 9324 to 9323');
        expect(repository.input.value).to.not.contain('thinking');
        expect(repository.input.value).to.not.contain('signature');
        expect(repository.input.value).to.not.contain('getGitChanges');
    });

    it('skips the warn dialog when the commit field is empty', async () => {
        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            request.response.response.addContent(new TextChatResponseContentImpl('fix: something'));
            request.response.complete();
        });

        repository.input.value = '';
        await runner.run('all');

        expect(messageService.warn.called).to.be.false;
        expect(repository.input.value).to.equal('fix: something');
    });

    it('asks the user for confirmation when the commit field already has text', async () => {
        repository.input.value = 'existing text';
        messageService.warn.resolves('Replace');

        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            request.response.response.addContent(new TextChatResponseContentImpl('new message'));
            request.response.complete();
        });

        await runner.run('staged');

        expect(messageService.warn.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('new message');
    });

    it('aborts without invoking the agent when the user cancels the overwrite prompt', async () => {
        repository.input.value = 'existing text';
        messageService.warn.resolves('Cancel');

        await runner.run('staged');

        expect(agent.invoke.called).to.be.false;
        expect(repository.input.value).to.equal('existing text');
    });

    it('shows an error notification when the agent fails', async () => {
        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            request.response.error(new Error('boom'));
        });

        await runner.run('staged');

        expect(messageService.error.calledOnce).to.be.true;
        expect(messageService.error.firstCall.args[0]).to.contain('boom');
        expect(repository.input.value).to.equal('');
    });

    it('shows a warning when the model returns empty text', async () => {
        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            request.response.complete();
        });

        await runner.run('all');

        expect(messageService.warn.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('');
    });

    it('does not change the input when the request is canceled', async () => {
        agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
            request.cancel();
        });

        await runner.run('staged');

        expect(repository.input.value).to.equal('');
        expect(messageService.error.called).to.be.false;
    });

    it('isRunning reflects an in-flight invocation and cancel triggers the request', async () => {
        let captured: MutableChatRequestModel | undefined;
        const completionDeferred = new Promise<void>(resolve => {
            agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
                captured = request;
                resolve();
                await new Promise<void>(finish => {
                    const listener = request.response.onDidChange(() => {
                        if (request.response.isCanceled) {
                            listener.dispose();
                            finish();
                        }
                    });
                });
            });
        });

        const runPromise = runner.run('staged');
        await completionDeferred;
        expect(runner.isRunning('staged')).to.be.true;

        runner.cancel('staged');
        await runPromise;

        expect(runner.isRunning('staged')).to.be.false;
        expect(captured!.response.isCanceled).to.be.true;
    });

    it('warns and returns when no repository is selected', async () => {
        scmService.selectedRepository = undefined;

        await runner.run('staged');

        expect(messageService.warn.calledOnce).to.be.true;
        expect(agent.invoke.called).to.be.false;
    });

    it('cancel during the overwrite prompt aborts before the agent is invoked', async () => {
        repository.input.value = 'existing text';
        // Simulate the user picking "Replace": the overwrite prompt would have resolved positively,
        // but a click on the spinning cancel button in between must still cancel the run.
        let resolvePrompt: (choice: string) => void = () => { /* set on first call */ };
        messageService.warn.callsFake(() => new Promise<string>(resolve => { resolvePrompt = resolve; }));

        const runPromise = runner.run('staged');

        // Wait for the prompt to be shown.
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runner.isRunning('staged')).to.be.true;
        expect(messageService.warn.calledOnce).to.be.true;

        runner.cancel('staged');
        resolvePrompt('Replace');
        await runPromise;

        expect(agent.invoke.called).to.be.false;
        expect(repository.input.value).to.equal('existing text');
        expect(runner.isRunning('staged')).to.be.false;
    });

    describe('getGitChanges tool-allow gate', () => {

        it('skips the dialog when the tool is already on ALWAYS_ALLOW', async () => {
            // Default mock already returns ALWAYS_ALLOW.
            agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
                request.response.response.addContent(new TextChatResponseContentImpl('feat: thing'));
                request.response.complete();
            });

            await runner.run('staged');

            expect(messageService.warn.called).to.be.false;
            expect(confirmationManager.setConfirmationMode.called).to.be.false;
            expect(agent.invoke.calledOnce).to.be.true;
            expect(repository.input.value).to.equal('feat: thing');
        });

        it('shows the CONFIRM-mode dialog and proceeds + persists ALWAYS_ALLOW when the user clicks Allow', async () => {
            confirmationManager.getConfirmationMode.returns(ToolConfirmationMode.CONFIRM);
            messageService.warn.resolves('Allow');
            agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
                request.response.response.addContent(new TextChatResponseContentImpl('feat: thing'));
                request.response.complete();
            });

            await runner.run('staged');

            expect(messageService.warn.calledOnce).to.be.true;
            const [warnMessage] = messageService.warn.firstCall.args;
            expect(warnMessage).to.contain(GET_GIT_CHANGES_FUNCTION_ID);
            expect(warnMessage).to.not.contain('disabled');
            expect(confirmationManager.setConfirmationMode.calledOnce).to.be.true;
            expect(confirmationManager.setConfirmationMode.firstCall.args).to.deep.equal([
                GET_GIT_CHANGES_FUNCTION_ID,
                ToolConfirmationMode.ALWAYS_ALLOW
            ]);
            expect(agent.invoke.calledOnce).to.be.true;
            expect(repository.input.value).to.equal('feat: thing');
        });

        it('shows DISABLED-mode dialog copy when the tool is currently disabled', async () => {
            confirmationManager.getConfirmationMode.returns(ToolConfirmationMode.DISABLED);
            messageService.warn.resolves('Allow');
            agent.invoke.callsFake(async (request: MutableChatRequestModel) => {
                request.response.response.addContent(new TextChatResponseContentImpl('chore: thing'));
                request.response.complete();
            });

            await runner.run('all');

            expect(messageService.warn.calledOnce).to.be.true;
            const [warnMessage] = messageService.warn.firstCall.args;
            expect(warnMessage).to.contain(GET_GIT_CHANGES_FUNCTION_ID);
            expect(warnMessage).to.contain('disabled');
            expect(confirmationManager.setConfirmationMode.calledOnce).to.be.true;
            expect(confirmationManager.setConfirmationMode.firstCall.args).to.deep.equal([
                GET_GIT_CHANGES_FUNCTION_ID,
                ToolConfirmationMode.ALWAYS_ALLOW
            ]);
            expect(agent.invoke.calledOnce).to.be.true;
        });

        it('aborts before invoking the agent when the user cancels the gate dialog', async () => {
            confirmationManager.getConfirmationMode.returns(ToolConfirmationMode.CONFIRM);
            messageService.warn.resolves(undefined); // user dismissed / picked Cancel

            await runner.run('staged');

            expect(messageService.warn.calledOnce).to.be.true;
            expect(confirmationManager.setConfirmationMode.called).to.be.false;
            expect(agent.invoke.called).to.be.false;
            expect(repository.input.value).to.equal('');
        });
    });
});
