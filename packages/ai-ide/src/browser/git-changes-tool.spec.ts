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
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ShellExecutionRequest, ShellExecutionResult, ShellExecutionServer } from '@theia/ai-terminal/lib/common/shell-execution-server';
import { GET_GIT_CHANGES_FUNCTION_ID, GetGitChangesTool } from './git-changes-tool';

disableJSDOM();

function createResult(overrides: Partial<ShellExecutionResult> = {}): ShellExecutionResult {
    return { success: true, exitCode: 0, stdout: 'staged diff', stderr: '', duration: 1, ...overrides };
}

function makeRepo(rootUri: string): ScmRepository {
    return { provider: { rootUri } } as unknown as ScmRepository;
}

describe('GetGitChangesTool', () => {

    let container: Container;
    let shellServer: { execute: sinon.SinonStub; cancel: sinon.SinonStub };
    let scmService: { selectedRepository: ScmRepository | undefined };
    let tool: GetGitChangesTool;

    function executedCommands(): string[] {
        return shellServer.execute.getCalls().map(call => (call.args[0] as ShellExecutionRequest).command);
    }

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();
        shellServer = { execute: sinon.stub().resolves(createResult()), cancel: sinon.stub().resolves(true) };
        const workspaceService: Partial<WorkspaceService> = {
            getWorkspaceRootUri: () => new URI('file:///workspace-root')
        };
        scmService = { selectedRepository: undefined };
        container.bind(ShellExecutionServer).toConstantValue(shellServer as unknown as ShellExecutionServer);
        container.bind(WorkspaceService).toConstantValue(workspaceService as WorkspaceService);
        container.bind(ScmService).toConstantValue(scmService as unknown as ScmService);
        container.bind(GetGitChangesTool).toSelf();
        tool = container.get(GetGitChangesTool);
    });

    it('exposes the well-known tool id getGitChanges', () => {
        expect(tool.getTool().id).to.equal(GET_GIT_CHANGES_FUNCTION_ID);
    });

    it('runs a single "git diff --cached" for both the tool invocation and getChanges', async () => {
        await tool.getTool().handler('{}');
        expect(await tool.getChanges()).to.equal('staged diff');
        expect(executedCommands()).to.deep.equal([
            'git diff --cached --no-color',
            'git diff --cached --no-color'
        ]);
    });

    it('uses only cross-platform commands with no POSIX-only shell operators', async () => {
        await tool.getChanges();
        for (const command of executedCommands()) {
            expect(command).to.not.match(/;|\||xargs|sh -c|\/dev\/null/);
        }
    });

    it('throws instead of returning the error output when the git command fails', async () => {
        shellServer.execute.resolves(createResult({
            success: false,
            exitCode: 128,
            stdout: '',
            stderr: 'fatal: not a git repository'
        }));

        let caught: Error | undefined;
        try {
            await tool.getChanges();
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/fatal: not a git repository/);
    });

    it('returns an empty diff when the execution was canceled', async () => {
        shellServer.execute.resolves(createResult({ canceled: true, stdout: 'partial' }));
        expect(await tool.getChanges()).to.equal('');
    });

    it('keeps far more diff lines than the default shellExecute budget', async () => {
        const stdout = Array.from({ length: 600 }, (_unused, index) => `+line ${index}`).join('\n');
        shellServer.execute.resolves(createResult({ stdout }));

        const output = await tool.getChanges();

        expect(output).to.contain('+line 300');
        expect(output).to.not.contain('lines omitted');
    });

    it('runs under the selected SCM repository root when one is selected', async () => {
        scmService.selectedRepository = makeRepo('file:///workspace-root/subrepo');
        await tool.getChanges();
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        // URI.fsPath() uses the platform-native separator (backslashes on Windows); normalize for the assertion.
        expect(arg.cwd?.replace(/\\/g, '/')).to.equal('/workspace-root/subrepo');
    });

    it('falls back to the workspace root when no repository is selected', async () => {
        await tool.getChanges();
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.cwd?.replace(/\\/g, '/')).to.equal('/workspace-root');
    });

    it('does not declare checkAutoAction so confirmation flows through the normal ToolConfirmationManager', () => {
        expect(tool.getTool().checkAutoAction).to.be.undefined;
    });
});
