// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import * as cp from 'child_process';
import { Container } from 'inversify';
import { ILogger } from '../common/logger';
import { MockLogger } from '../common/test/mock-logger';
import { ProcessUtils } from './process-utils';
import { EXITING_BACKEND_EXIT_CODE, EXITING_BACKEND_NO_POWERSHELL } from './test/exiting-backend';

interface ExitingProcessResult {
    exitCode: number | null;
    childPid: number;
}

function runExitingProcess(options: { env?: NodeJS.ProcessEnv, detached?: boolean } = {}): Promise<ExitingProcessResult> {
    return new Promise((resolve, reject) => {
        const exitingProcess = cp.spawn(process.execPath, [require.resolve('./test/exiting-backend')], {
            env: { ...process.env, ...options.env },
            detached: options.detached,
            stdio: ['ignore', 'pipe', 'inherit'],
            windowsHide: true
        });
        let stdout = '';
        exitingProcess.stdout.on('data', data => stdout += data);
        exitingProcess.on('error', reject);
        exitingProcess.on('close', exitCode => resolve({ exitCode, childPid: Number.parseInt(stdout, 10) }));
    });
}

function isAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
}

/**
 * Waits a little for the process to disappear, as killing it may not take effect immediately.
 */
async function isAliveAfterKill(pid: number): Promise<boolean> {
    for (let attempt = 0; attempt < 20 && isAlive(pid); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return isAlive(pid);
}

describe('ProcessUtils (real processes)', function (): void {

    this.timeout(30_000);

    const childPids: number[] = [];

    afterEach(() => {
        // Do not leak processes if a test fails.
        for (const pid of childPids.splice(0)) {
            if (isAlive(pid)) {
                process.kill(pid);
            }
        }
    });

    async function expectTerminatedTree(options: Parameters<typeof runExitingProcess>[0], expectedExitCode: number): Promise<void> {
        const { exitCode, childPid } = await runExitingProcess(options);
        expect(childPid, 'the exiting process should report the PID of its child').to.be.greaterThan(0);
        childPids.push(childPid);
        expect(exitCode).to.equal(expectedExitCode);
        expect(await isAliveAfterKill(childPid), 'the child of the exiting process should be killed').to.be.false;
    }

    it('keeps the exit code of the backend and kills its children', async () => {
        await expectTerminatedTree({}, EXITING_BACKEND_EXIT_CODE);
    });

    (process.platform === 'win32' ? it.skip : it)('keeps the exit code of the backend when it leads its process group', async () => {
        await expectTerminatedTree({ detached: true }, EXITING_BACKEND_EXIT_CODE);
    });

    (process.platform === 'win32' ? it : it.skip)('kills the whole tree of the backend when PowerShell cannot be run', async () => {
        // Only PowerShell is made unrunnable: breaking the environment, e.g. `SystemRoot`, would
        // break `taskkill.exe` as well. The fallback kills the backend too, with exit code 1.
        await expectTerminatedTree({ env: { [EXITING_BACKEND_NO_POWERSHELL]: 'true' } }, 1);
    });

    (process.platform === 'win32' ? it : it.skip)('lists the children of a process with PowerShell', async () => {
        const container = new Container();
        container.bind(ProcessUtils).toSelf().inSingletonScope();
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        const processUtils = container.get(ProcessUtils);

        const children = [1, 2].map(() => cp.spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }));
        await Promise.all(children.map(child => new Promise(resolve => child.on('spawn', resolve))));
        childPids.push(...children.map(child => child.pid!));

        const listedPids = processUtils['winGetChildPids'](process.pid);
        expect(listedPids).to.include.members(childPids);
        // The PowerShell process that lists the children has exited by now, so it must not be listed.
        expect(listedPids.filter(pid => !isAlive(pid)), 'only live processes should be listed').to.be.empty;
    });
});
