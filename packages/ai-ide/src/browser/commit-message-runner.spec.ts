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
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
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
    let confirmDialogOpen: sinon.SinonStub;

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
        // The overwrite prompt is a modal `ConfirmDialog`, not a toast, so it is stubbed at the
        // prototype instead of via `MessageService`.
        confirmDialogOpen = sinon.stub(ConfirmDialog.prototype, 'open').resolves(true);

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
        await runner.run();

        expect(gitChangesTool.getChanges.calledOnce).to.be.true;
        expect(agent.generateCommitMessage.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('feat: add new thing');
        expect(focusSpy.calledOnce).to.be.true;
        expect(messageService.error.called).to.be.false;
    });

    it('warns and does not invoke the agent when no repository is selected', async () => {
        scmService.selectedRepository = undefined;

        await runner.run();

        expect(messageService.warn.calledOnce).to.be.true;
        expect(gitChangesTool.getChanges.called).to.be.false;
        expect(agent.generateCommitMessage.called).to.be.false;
    });

    it('does not await notifications, so a dismissed toast cannot leave the run hanging', async () => {
        scmService.selectedRepository = undefined;
        // A toast the user never interacts with never settles; awaiting it would hang `run`.
        messageService.warn.returns(new Promise<undefined>(() => { /* never settles */ }));

        await runner.run();

        expect(runner.isRunning()).to.be.false;
    });

    it('warns and does not invoke the agent when there are no staged changes', async () => {
        gitChangesTool.getChanges.resolves('   \n  ');

        await runner.run();

        expect(messageService.warn.calledOnce).to.be.true;
        expect(agent.generateCommitMessage.called).to.be.false;
        expect(repository.input.value).to.equal('');
    });

    it('skips the overwrite prompt when the commit field is empty', async () => {
        repository.input.value = '';

        await runner.run();

        expect(confirmDialogOpen.called).to.be.false;
        expect(repository.input.value).to.equal('feat: add new thing');
    });

    it('asks for confirmation in a modal dialog and overwrites when the user accepts', async () => {
        repository.input.value = 'existing text';

        await runner.run();

        expect(confirmDialogOpen.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('feat: add new thing');
    });

    it('aborts without invoking the agent when the user cancels the overwrite prompt', async () => {
        repository.input.value = 'existing text';
        confirmDialogOpen.resolves(undefined);

        await runner.run();

        expect(agent.generateCommitMessage.called).to.be.false;
        expect(repository.input.value).to.equal('existing text');
    });

    it('does not invoke the agent when the run is canceled while the overwrite prompt is open', async () => {
        repository.input.value = 'existing text';
        let confirm: (replace: boolean) => void = () => { /* set below */ };
        confirmDialogOpen.callsFake(() => new Promise<boolean>(resolve => { confirm = resolve; }));

        const runPromise = runner.run();
        await new Promise(resolve => setTimeout(resolve, 0));

        runner.cancel();
        confirm(true);
        await runPromise;

        expect(agent.generateCommitMessage.called).to.be.false;
        expect(repository.input.value).to.equal('existing text');
    });

    it('shows an error notification when the agent fails', async () => {
        agent.generateCommitMessage.rejects(new Error('boom'));

        await runner.run();

        expect(messageService.error.calledOnce).to.be.true;
        expect(messageService.error.firstCall.args[0]).to.contain('boom');
        expect(repository.input.value).to.equal('');
    });

    it('shows an error notification when reading the staged changes fails', async () => {
        gitChangesTool.getChanges.rejects(new Error('fatal: not a git repository'));

        await runner.run();

        expect(messageService.error.calledOnce).to.be.true;
        expect(messageService.error.firstCall.args[0]).to.contain('fatal: not a git repository');
        expect(agent.generateCommitMessage.called).to.be.false;
    });

    it('warns when the model returns an empty message', async () => {
        agent.generateCommitMessage.resolves('');

        await runner.run();

        expect(messageService.warn.calledOnce).to.be.true;
        expect(repository.input.value).to.equal('');
    });

    it('does not change the input or notify when the run is canceled mid-generation', async () => {
        let resolveGeneration: (message: string) => void = () => { /* set below */ };
        agent.generateCommitMessage.callsFake(() => new Promise<string>(resolve => { resolveGeneration = resolve; }));

        const runPromise = runner.run();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runner.isRunning()).to.be.true;

        runner.cancel();
        resolveGeneration('feat: ignored');
        await runPromise;

        expect(repository.input.value).to.equal('');
        expect(messageService.error.called).to.be.false;
        expect(runner.isRunning()).to.be.false;
    });

    it('ignores a second run while one is still in flight', async () => {
        let resolveChanges: (diff: string) => void = () => { /* set below */ };
        gitChangesTool.getChanges.callsFake(() => new Promise<string>(resolve => { resolveChanges = resolve; }));

        const firstRun = runner.run();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(runner.isRunning()).to.be.true;

        await runner.run();
        expect(gitChangesTool.getChanges.calledOnce).to.be.true;

        resolveChanges('diff --git a b');
        await firstRun;
        expect(runner.isRunning()).to.be.false;
    });
});
