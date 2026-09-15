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
import { GET_GIT_CHANGES_FUNCTION_ID, GetGitChangesTool, GitChangesRepositoryError } from './git-changes-tool';

disableJSDOM();

function shellResult(overrides: Partial<ShellExecutionResult> = {}): ShellExecutionResult {
    return { success: true, exitCode: 0, stdout: 'staged diff', stderr: '', duration: 1, ...overrides };
}

function makeRepo(rootUri: string): ScmRepository {
    return { provider: { rootUri } } as unknown as ScmRepository;
}

describe('GetGitChangesTool', () => {

    let container: Container;
    let shellServer: { execute: sinon.SinonStub; cancel: sinon.SinonStub };
    let scmService: { repositories: ScmRepository[]; selectedRepository: ScmRepository | undefined };
    let workspaceRoots: URI[];
    let tool: GetGitChangesTool;

    const backend = makeRepo('file:///work/backend');
    const frontend = makeRepo('file:///work/frontend');
    const nested = makeRepo('file:///work/backend/vendor/lib');

    function cwdOfCall(index = 0): string | undefined {
        return (shellServer.execute.getCall(index).args[0] as ShellExecutionRequest).cwd?.replace(/\\/g, '/');
    }

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();
        shellServer = { execute: sinon.stub().resolves(shellResult()), cancel: sinon.stub().resolves(true) };
        workspaceRoots = [new URI('file:///work/backend'), new URI('file:///work/frontend')];
        scmService = { repositories: [backend, frontend, nested], selectedRepository: frontend };
        const workspaceService: Partial<WorkspaceService> = {
            tryGetRoots: () => workspaceRoots.map(resource => ({ resource } as never))
        };
        container.bind(ShellExecutionServer).toConstantValue(shellServer as unknown as ShellExecutionServer);
        container.bind(ScmService).toConstantValue(scmService as unknown as ScmService);
        container.bind(WorkspaceService).toConstantValue(workspaceService as WorkspaceService);
        container.bind(GetGitChangesTool).toSelf();
        tool = container.get(GetGitChangesTool);
    });

    afterEach(() => sinon.restore());

    it('exposes the well-known tool id getGitChanges with a repository parameter', () => {
        const request = tool.getTool();
        expect(request.id).to.equal(GET_GIT_CHANGES_FUNCTION_ID);
        expect((request.parameters.properties.repository as { type: string }).type).to.equal('string');
        expect(request.parameters.required ?? []).to.not.contain('repository');
    });

    it('runs a cross-platform "git diff --cached" with no POSIX-only shell operators', async () => {
        await tool.getTool().handler('{}');
        const command = (shellServer.execute.firstCall.args[0] as ShellExecutionRequest).command;
        expect(command).to.equal('git diff --cached --no-color');
        expect(command).to.not.match(/;|\||xargs|sh -c|\/dev\/null/);
    });

    it('falls back to the selected repository when no repository argument is given', async () => {
        await tool.getTool().handler('{}');
        expect(cwdOfCall()).to.equal('/work/frontend');
    });

    it('runs in the named repository rather than the selected one', async () => {
        const result = await tool.getTool().handler(JSON.stringify({ repository: 'backend' })) as { output: string };
        expect(result.output).to.equal('staged diff');
        expect(cwdOfCall()).to.equal('/work/backend');
    });

    it('identifies a repository nested inside a workspace root by its relative path', async () => {
        await tool.getTool().handler(JSON.stringify({ repository: 'backend/vendor/lib' }));
        expect(cwdOfCall()).to.equal('/work/backend/vendor/lib');
    });

    it('labels the argument with the repository for the tool-call summary', () => {
        const label = tool.getTool().getArgumentsShortLabel!(JSON.stringify({ repository: 'backend' }));
        expect(label).to.deep.equal({ label: 'backend', hasMore: false });
    });

    it('accepts an absolute path and ignores separator and case differences', async () => {
        await tool.getTool().handler(JSON.stringify({ repository: '/work/backend' }));
        expect(cwdOfCall()).to.equal('/work/backend');

        await tool.getTool().handler(JSON.stringify({ repository: 'BackEnd/' }));
        expect(cwdOfCall(1)).to.equal('/work/backend');
    });

    it('reports the known repositories instead of running an unknown one', async () => {
        const result = await tool.getTool().handler(JSON.stringify({ repository: '../../etc' })) as GitChangesRepositoryError;
        expect(result.error).to.contain('../../etc');
        expect(result.availableRepositories).to.deep.equal(['backend', 'frontend', 'backend/vendor/lib']);
        expect(shellServer.execute.called).to.be.false;
    });

    it('never derives the working directory from the argument, only from the matched repository', async () => {
        await tool.getTool().handler(JSON.stringify({ repository: 'backend; rm -rf /' }));
        expect(shellServer.execute.called).to.be.false;
    });

    it('asks for a repository when none is named and none is selected', async () => {
        scmService.selectedRepository = undefined;
        const result = await tool.getTool().handler('{}') as GitChangesRepositoryError;
        expect(result.error).to.contain('repository argument');
        expect(shellServer.execute.called).to.be.false;
    });

    it('throws instead of returning the error output when the git command fails', async () => {
        shellServer.execute.resolves(shellResult({
            success: false,
            exitCode: 128,
            stdout: '',
            stderr: 'fatal: not a git repository'
        }));

        let caught: Error | undefined;
        try {
            await tool.getStagedChanges(backend);
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/fatal: not a git repository/);
    });

    it('returns an empty diff when the execution was canceled', async () => {
        shellServer.execute.resolves(shellResult({ canceled: true, stdout: 'partial' }));
        expect(await tool.getStagedChanges(backend)).to.equal('');
    });

    it('keeps far more diff lines than the default shellExecute budget', async () => {
        const stdout = Array.from({ length: 600 }, (_unused, index) => `+line ${index}`).join('\n');
        shellServer.execute.resolves(shellResult({ stdout }));

        const diff = await tool.getStagedChanges(backend);

        expect(diff).to.contain('+line 300');
        expect(diff).to.not.contain('lines omitted');
    });

    it('does not declare checkAutoAction so confirmation flows through the normal ToolConfirmationManager', () => {
        expect(tool.getTool().checkAutoAction).to.be.undefined;
    });
});
