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
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ShellExecutionRequest, ShellExecutionResult, ShellExecutionServer } from '@theia/ai-terminal/lib/common/shell-execution-server';
import { GET_GIT_CHANGES_FUNCTION_ID, GetGitChangesTool } from './git-changes-tool';

function createResult(stdout = ''): ShellExecutionResult {
    return { success: true, exitCode: 0, stdout, stderr: '', duration: 1 };
}

function makeRepo(rootUri: string): ScmRepository {
    return { provider: { rootUri } } as unknown as ScmRepository;
}

/** Shell mock: tracked diff for `git diff ...`, the given untracked list for `git ls-files ...`. */
function shellStub(trackedDiff = 'tracked diff', untrackedList = ''): sinon.SinonStub {
    return sinon.stub().callsFake((request: ShellExecutionRequest) =>
        Promise.resolve(createResult(request.command.startsWith('git ls-files') ? untrackedList : trackedDiff)));
}

describe('GetGitChangesTool', () => {

    let container: Container;
    let shellServer: { execute: sinon.SinonStub; cancel: sinon.SinonStub };
    let scmService: { selectedRepository: ScmRepository | undefined };
    let fileService: { read: sinon.SinonStub };
    let tool: GetGitChangesTool;

    function executedCommands(): string[] {
        return shellServer.execute.getCalls().map(call => (call.args[0] as ShellExecutionRequest).command);
    }

    beforeEach(() => {
        container = new Container();
        shellServer = { execute: shellStub(), cancel: sinon.stub().resolves(true) };
        const workspaceService: Partial<WorkspaceService> = {
            getWorkspaceRootUri: () => new URI('file:///workspace-root')
        };
        scmService = { selectedRepository: undefined };
        fileService = { read: sinon.stub().resolves({ value: '' }) };
        container.bind(ShellExecutionServer).toConstantValue(shellServer as unknown as ShellExecutionServer);
        container.bind(WorkspaceService).toConstantValue(workspaceService as WorkspaceService);
        container.bind(ScmService).toConstantValue(scmService as unknown as ScmService);
        container.bind(FileService).toConstantValue(fileService as unknown as FileService);
        container.bind(GetGitChangesTool).toSelf();
        tool = container.get(GetGitChangesTool);
    });

    it('exposes the well-known tool id getGitChanges', () => {
        expect(tool.getTool().id).to.equal(GET_GIT_CHANGES_FUNCTION_ID);
    });

    it('declares a stagedOnly boolean parameter', () => {
        const stagedOnly = tool.getTool().parameters.properties.stagedOnly as { type: string };
        expect(stagedOnly.type).to.equal('boolean');
    });

    it('runs "git diff HEAD" then lists untracked files by default (tool invocation)', async () => {
        await tool.getTool().handler('{}');
        expect(executedCommands()[0]).to.equal('git diff HEAD --no-color');
        expect(executedCommands()).to.include('git ls-files --others --exclude-standard -z');
    });

    it('appends untracked file content on the tool invocation, not just getChanges', async () => {
        shellServer.execute = shellStub('tracked diff', 'new.txt\0');
        fileService.read.resolves({ value: 'body\n' });

        const result = await tool.getTool().handler('{}');

        expect((result as { output: string }).output).to.contain('New file new.txt:');
        expect((result as { output: string }).output).to.contain('body');
    });

    it('runs only "git diff --cached" when stagedOnly is true, skipping untracked files', async () => {
        const output = await tool.getChanges(true);
        expect(executedCommands()).to.deep.equal(['git diff --cached --no-color']);
        expect(fileService.read.called).to.be.false;
        expect(output).to.equal('tracked diff');
    });

    it('uses only cross-platform commands with no POSIX-only shell operators', async () => {
        shellServer.execute = shellStub('tracked diff', 'new.txt\0');
        fileService.read.resolves({ value: 'content\n' });
        await tool.getChanges(false);
        for (const command of executedCommands()) {
            expect(command).to.not.match(/;|\||xargs|sh -c/);
        }
    });

    it('appends untracked file content read through the FileService', async () => {
        shellServer.execute = shellStub('tracked diff', 'src/new.txt\0');
        fileService.read.resolves({ value: 'hello\nworld\n' });

        const output = await tool.getChanges(false);

        expect(output).to.contain('tracked diff');
        expect(output).to.contain('New file src/new.txt:');
        expect(output).to.contain('hello');
        expect(output).to.contain('world');
    });

    it('labels untracked binary files without dumping their content', async () => {
        shellServer.execute = shellStub('', 'image.bin\0');
        fileService.read.resolves({ value: 'PNG\0\0data' });

        const output = await tool.getChanges(false);

        expect(output).to.contain('New binary file image.bin');
        expect(output).to.not.contain('PNG');
    });

    it('runs under the selected SCM repository root when one is selected', async () => {
        scmService.selectedRepository = makeRepo('file:///workspace-root/subrepo');
        await tool.getChanges(true);
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        // URI.fsPath() uses the platform-native separator (backslashes on Windows); normalize for the assertion.
        expect(arg.cwd?.replace(/\\/g, '/')).to.equal('/workspace-root/subrepo');
    });

    it('falls back to the workspace root when no repository is selected', async () => {
        await tool.getChanges(true);
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.cwd?.replace(/\\/g, '/')).to.equal('/workspace-root');
    });

    it('does not declare checkAutoAction so confirmation flows through the normal ToolConfirmationManager', () => {
        expect(tool.getTool().checkAutoAction).to.be.undefined;
    });
});
