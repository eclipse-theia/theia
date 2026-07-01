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
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ShellExecutionRequest, ShellExecutionResult, ShellExecutionServer } from '../common/shell-execution-server';
import { PREDEFINED_SHELL_TOOL_PROVIDER, PredefinedShellTool } from './predefined-shell-tool';

disableJSDOM();

class TestPredefinedShellTool extends PredefinedShellTool {
    readonly id = 'test-predefined';
    readonly description = 'A test predefined shell tool that returns hello';

    protected buildCommand(args: Record<string, unknown>): string {
        const upper = args.upper === true;
        return upper ? 'echo HELLO' : 'echo hello';
    }
}

function createResult(overrides: Partial<ShellExecutionResult> = {}): ShellExecutionResult {
    return {
        success: true,
        exitCode: 0,
        stdout: 'hello\n',
        stderr: '',
        duration: 5,
        ...overrides
    };
}

describe('PredefinedShellTool', () => {

    let container: Container;
    let shellServer: { execute: sinon.SinonStub; cancel: sinon.SinonStub };
    let tool: TestPredefinedShellTool;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        container = new Container();
        shellServer = {
            execute: sinon.stub().resolves(createResult()),
            cancel: sinon.stub().resolves(true)
        };
        const workspaceService: Partial<WorkspaceService> = {
            getWorkspaceRootUri: () => new URI('file:///workspace')
        };
        container.bind(ShellExecutionServer).toConstantValue(shellServer as unknown as ShellExecutionServer);
        container.bind(WorkspaceService).toConstantValue(workspaceService as WorkspaceService);
        container.bind(TestPredefinedShellTool).toSelf();
        tool = container.get(TestPredefinedShellTool);
    });

    it('exposes the subclass id and description on the tool', () => {
        const request = tool.getTool();
        expect(request.id).to.equal('test-predefined');
        expect(request.name).to.equal('test-predefined');
        expect(request.description).to.equal('A test predefined shell tool that returns hello');
        expect(request.providerName).to.equal(PREDEFINED_SHELL_TOOL_PROVIDER);
    });

    it('does not declare checkAutoAction so confirmation flows through the normal ToolConfirmationManager', () => {
        const request = tool.getTool();
        expect(request.checkAutoAction).to.be.undefined;
    });

    it('passes the hardcoded command, workspace root and a generated execution id to ShellExecutionServer', async () => {
        const request = tool.getTool();
        await request.handler('{}');
        expect(shellServer.execute.calledOnce).to.be.true;
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.command).to.equal('echo hello');
        // URI.fsPath() uses the platform-native separator, so the cwd comes back as
        // `\workspace` on Windows. Normalize before asserting to keep the test platform-agnostic.
        expect(arg.cwd?.replace(/\\/g, '/')).to.equal('/workspace');
        expect(arg.timeout).to.equal(30_000);
        expect(typeof arg.executionId).to.equal('string');
        expect(arg.executionId!.length).to.be.greaterThan(0);
    });

    it('forwards typed args to buildCommand', async () => {
        const request = tool.getTool();
        await request.handler(JSON.stringify({ upper: true }));
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.command).to.equal('echo HELLO');
    });

    it('handles an empty argument string as an empty args object', async () => {
        const request = tool.getTool();
        await request.handler('');
        const arg = shellServer.execute.firstCall.args[0] as ShellExecutionRequest;
        expect(arg.command).to.equal('echo hello');
    });

    it('returns a formatted result with combined output', async () => {
        shellServer.execute.resolves(createResult({ stdout: 'out\n', stderr: 'err\n' }));
        const request = tool.getTool();
        const raw = await request.handler('{}');
        expect(raw).to.deep.include({
            success: true,
            exitCode: 0
        });
        const result = raw as { output: string };
        expect(result.output).to.contain('out');
        expect(result.output).to.contain('err');
    });

    it('returns a canceled result when the underlying execution is canceled', async () => {
        shellServer.execute.resolves(createResult({ canceled: true, stdout: 'partial\n', stderr: '' }));
        const request = tool.getTool();
        const result = await request.handler('{}') as { canceled: true; output?: string };
        expect(result.canceled).to.be.true;
        expect(result.output).to.contain('partial');
    });

    it('wires the invocation cancellation token to ShellExecutionServer.cancel', async () => {
        const cts = new CancellationTokenSource();
        const request = tool.getTool();

        let capturedExecutionId: string | undefined;
        shellServer.execute.callsFake(async (req: ShellExecutionRequest) => {
            capturedExecutionId = req.executionId;
            return new Promise<ShellExecutionResult>(resolve => {
                cts.token.onCancellationRequested(() => resolve(createResult({ canceled: true, stdout: '', stderr: '' })));
            });
        });

        const handlerPromise = request.handler('{}', { toolCallId: 'tc-1', cancellationToken: cts.token });
        cts.cancel();
        await handlerPromise;

        expect(shellServer.cancel.calledOnce).to.be.true;
        expect(shellServer.cancel.firstCall.args[0]).to.equal(capturedExecutionId);
    });
});
