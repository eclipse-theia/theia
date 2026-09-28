// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { OS } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { Container } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ShellExecutionRequest, ShellExecutionServer } from '../common/shell-execution-server';
import { ShellCommandPermissionService } from './shell-command-permission-service';
import { ShellExecutionTool } from './shell-execution-tool';

disableJSDOM();

describe('ShellExecutionTool working directory', () => {

    let shellServer: { execute: sinon.SinonStub; cancel: sinon.SinonStub };
    let tool: ShellExecutionTool;

    let originalIsWindows: boolean;
    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });
    beforeEach(() => {
        originalIsWindows = OS.backend.isWindows;
        OS.backend.isWindows = false;
    });
    afterEach(() => {
        OS.backend.isWindows = originalIsWindows;
    });

    const setUp = (roots: string[]): void => {
        const container = new Container();
        shellServer = {
            execute: sinon.stub().callsFake(async (request: ShellExecutionRequest) => ({
                success: true, exitCode: 0, stdout: '', stderr: '', duration: 0, resolvedCwd: request.cwd
            })),
            cancel: sinon.stub().resolves(true)
        };
        const workspaceService = {
            tryGetRoots: () => roots.map(root => ({ resource: new URI(root), isDirectory: true }))
        } as unknown as WorkspaceService;
        container.bind(ShellExecutionServer).toConstantValue(shellServer as unknown as ShellExecutionServer);
        container.bind(WorkspaceService).toConstantValue(workspaceService);
        container.bind(ShellCommandPermissionService).toConstantValue({} as ShellCommandPermissionService);
        container.bind(ShellExecutionTool).toSelf();
        tool = container.get(ShellExecutionTool);
    };

    const run = (args: { cwd?: string }): Promise<unknown> =>
        Promise.resolve(tool.getTool().handler(JSON.stringify({ command: 'pwd', description: 'Print the working directory', ...args }), undefined));

    const executedCwd = (): string | undefined => (shellServer.execute.lastCall.args[0] as ShellExecutionRequest).cwd;

    it('defaults to the workspace root in a single-root workspace', async () => {
        setUp(['file:///ws/theia']);
        await run({});
        expect(executedCwd()).to.equal('/ws/theia');
    });

    it('runs in the root directory named by cwd, so the command must not change into it again', async () => {
        setUp(['file:///ws/theia', 'file:///ws/other']);
        await run({ cwd: 'theia' });
        expect(executedCwd()).to.equal('/ws/theia');
    });

    // Documents the current behavior (D1): agents often omit cwd on their first call and get this error.
    it('requires cwd in a multi-root workspace (D1)', async () => {
        setUp(['file:///ws/theia', 'file:///ws/other']);
        let error: Error | undefined;
        try {
            await run({});
        } catch (e) {
            error = e;
        }
        expect(error?.message).to.contain('A working directory (cwd) is required in a multi-root workspace');
        expect(shellServer.execute.called).to.be.false;
    });
});
