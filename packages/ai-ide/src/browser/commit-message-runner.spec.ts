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
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmInput } from '@theia/scm/lib/browser/scm-input';
import { CommitMessageAgent } from './commit-message-agent';
import { CommitMessageRunner } from './commit-message-runner';
import { GetGitChangesTool } from './git-changes-tool';

disableJSDOM();

interface MockRepository {
    input: ScmInput;
}

describe('CommitMessageRunner', () => {

    let container: Container;
    let runner: CommitMessageRunner;
    let agent: { generateCommitMessage: sinon.SinonStub };
    let gitChangesTool: { getChanges: sinon.SinonStub };
    let scmService: { selectedRepository: MockRepository | undefined };
    let messageService: { warn: sinon.SinonStub; error: sinon.SinonStub; info: sinon.SinonStub };
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
        agent = { generateCommitMessage: sinon.stub().resolves('feat: add new thing') };
        gitChangesTool = { getChanges: sinon.stub().resolves('diff --git a b') };
        messageService = {
            warn: sinon.stub().resolves(undefined),
            error: sinon.stub().resolves(undefined),
            info: sinon.stub().resolves(undefined)
        };
        logger = {
            error: sinon.stub(),
            warn: sinon.stub(),
            info: sinon.stub(),
            debug: sinon.stub(),
            trace: sinon.stub()
        };

        container.bind(CommitMessageAgent).toConstantValue(agent as unknown as CommitMessageAgent);
        container.bind(GetGitChangesTool).toConstantValue(gitChangesTool as unknown as GetGitChangesTool);
        container.bind(ScmService).toConstantValue(scmService as unknown as ScmService);
        container.bind(MessageService).toConstantValue(messageService as unknown as MessageService);
        container.bind(ILogger).toConstantValue(logger as unknown as ILogger);
        container.bind(CommitMessageRunner).toSelf();

        runner = container.get(CommitMessageRunner);
    });

    afterEach(() => sinon.restore());

    it('writes the generated message into the SCM input and focuses it on success', async () => {
        await runner.run('staged');

        expect(gitChangesTool.getChanges.calledOnceWith(true)).to.be.true;
        expect(agent.generateCommitMessage.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('feat: add new thing');
        expect(focusSpy.calledOnce).to.be.true;
        expect(messageService.error.called).to.be.false;
    });

    it('passes stagedOnly=false to the git changes tool for the "all" scope', async () => {
        await runner.run('all');

        expect(gitChangesTool.getChanges.calledOnceWith(false)).to.be.true;
    });

    it('warns and does not invoke the agent when no repository is selected', async () => {
        scmService.selectedRepository = undefined;

        await runner.run('staged');

        expect(messageService.warn.calledOnce).to.be.true;
        expect(gitChangesTool.getChanges.called).to.be.false;
        expect(agent.generateCommitMessage.called).to.be.false;
    });

    it('warns and does not invoke the agent when there are no changes', async () => {
        gitChangesTool.getChanges.resolves('   \n  ');

        await runner.run('all');

        expect(messageService.warn.calledOnce).to.be.true;
        expect(agent.generateCommitMessage.called).to.be.false;
        expect(repository.input.value).to.equal('');
    });

    it('skips the overwrite prompt when the commit field is empty', async () => {
        repository.input.value = '';

        await runner.run('all');

        expect(messageService.warn.called).to.be.false;
        expect(repository.input.value).to.equal('feat: add new thing');
    });

    it('asks for confirmation and overwrites when the field already has text and the user accepts', async () => {
        repository.input.value = 'existing text';
        messageService.warn.resolves('Replace');

        await runner.run('staged');

        expect(messageService.warn.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('feat: add new thing');
    });

    it('aborts without invoking the agent when the user cancels the overwrite prompt', async () => {
        repository.input.value = 'existing text';
        messageService.warn.resolves('Cancel');

        await runner.run('staged');

        expect(agent.generateCommitMessage.called).to.be.false;
        expect(repository.input.value).to.equal('existing text');
    });

    it('shows an error notification when the agent fails', async () => {
        agent.generateCommitMessage.rejects(new Error('boom'));

        await runner.run('staged');

        expect(messageService.error.calledOnce).to.be.true;
        expect(messageService.error.firstCall.args[0]).to.contain('boom');
        expect(repository.input.value).to.equal('');
    });

    it('warns when the model returns an empty message', async () => {
        agent.generateCommitMessage.resolves('');

        await runner.run('all');

        expect(messageService.warn.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('');
    });

    it('does not change the input or notify when the run is canceled mid-generation', async () => {
        let resolveGeneration: (message: string) => void = () => { /* set below */ };
        agent.generateCommitMessage.callsFake(() => new Promise<string>(resolve => { resolveGeneration = resolve; }));

        const runPromise = runner.run('staged');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runner.isRunning('staged')).to.be.true;

        runner.cancel('staged');
        resolveGeneration('feat: ignored');
        await runPromise;

        expect(repository.input.value).to.equal('');
        expect(messageService.error.called).to.be.false;
        expect(runner.isRunning('staged')).to.be.false;
    });

    it('runs only one scope at a time, ignoring a second scope while one is in flight', async () => {
        let resolveChanges: (diff: string) => void = () => { /* set below */ };
        gitChangesTool.getChanges.callsFake(() => new Promise<string>(resolve => { resolveChanges = resolve; }));

        const stagedRun = runner.run('staged');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runner.isRunning('staged')).to.be.true;

        // The second scope must be ignored while the first run is still in flight.
        await runner.run('all');
        expect(gitChangesTool.getChanges.calledOnce).to.be.true;
        expect(runner.isRunning('all')).to.be.false;

        resolveChanges('diff --git a b');
        await stagedRun;
        expect(runner.isRunning('staged')).to.be.false;
    });
});
