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

describe('GetGitChangesTool', () => {

    let container: Container;
    let shellServer: { execute: sinon.SinonStub; cancel: sinon.SinonStub };
    let scmService: { selectedRepository: ScmRepository | undefined };
    let tool: GetGitChangesTool;

    beforeEach(() => {
        container = new Container();
        shellServer = {
            execute: sinon.stub().resolves(createResult('diff content')),
            cancel: sinon.stub().resolves(true)
        };
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
        expect(tool.getTool().id).to.equal('getGitChanges');
    });

    it('declares a stagedOnly boolean parameter', () => {
        const params = tool.getTool().parameters;
        expect(params.type).to.equal('object');
        expect(params.properties).to.have.property('stagedOnly');
        const stagedOnly = params.properties.stagedOnly as { type: string };
        expect(stagedOnly.type).to.equal('boolean');
    });

    it('combines "git diff HEAD" with untracked-file additions by default (no args)', async () => {
        await tool.getTool().handler('{}');
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.command).to.contain('git diff HEAD --no-color');
        expect(arg.command).to.contain('git ls-files --others --exclude-standard');
        expect(arg.command).to.contain('git diff --no-index --no-color');
    });

    it('combines "git diff HEAD" with untracked-file additions when stagedOnly is false', async () => {
        await tool.getTool().handler(JSON.stringify({ stagedOnly: false }));
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.command).to.contain('git diff HEAD --no-color');
        expect(arg.command).to.contain('git ls-files --others --exclude-standard');
    });

    it('runs "git diff --cached --no-color" when stagedOnly is true (untracked files omitted)', async () => {
        await tool.getTool().handler(JSON.stringify({ stagedOnly: true }));
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.command).to.equal('git diff --cached --no-color');
    });

    it('treats non-boolean stagedOnly values as false', async () => {
        await tool.getTool().handler(JSON.stringify({ stagedOnly: 'yes' }));
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.command).to.contain('git diff HEAD --no-color');
        expect(arg.command).to.contain('git ls-files --others --exclude-standard');
    });

    it('runs under the selected SCM repository root when one is selected', async () => {
        scmService.selectedRepository = makeRepo('file:///workspace-root/subrepo');
        await tool.getTool().handler('{}');
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        // URI.fsPath() uses the platform-native separator (backslashes on Windows); normalize for the assertion.
        expect(arg.cwd?.replace(/\\/g, '/')).to.equal('/workspace-root/subrepo');
    });

    it('falls back to the workspace root when no repository is selected', async () => {
        await tool.getTool().handler('{}');
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.cwd?.replace(/\\/g, '/')).to.equal('/workspace-root');
    });

    it('does not declare checkAutoAction so confirmation flows through the normal ToolConfirmationManager', () => {
        expect(tool.getTool().checkAutoAction).to.be.undefined;
    });
});
