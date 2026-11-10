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
import * as path from 'path';
import { Container } from 'inversify';
import { ILogger } from '../common/logger.js';
import { MockLogger } from '../common/test/mock-logger.js';
import { ProcessUtils } from './process-utils.js';
import {
    EXITING_BACKEND_CHILD_IGNORES_SIGTERM, EXITING_BACKEND_EXIT_CODE, EXITING_BACKEND_GRACEFUL, EXITING_BACKEND_NO_POWERSHELL
} from './test/exiting-backend.js';

interface ExitingProcessResult {
    exitCode: number | null;
    childPid: number;
}

function runExitingProcess(options: { env?: NodeJS.ProcessEnv, detached?: boolean } = {}): Promise<ExitingProcessResult> {
    return new Promise((resolve, reject) => {
        const exitingProcess = cp.spawn(process.execPath, [path.join(import.meta.dirname, 'test', 'exiting-backend.js')], {
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
            if (Number.isInteger(pid) && isAlive(pid)) {
                process.kill(pid, 'SIGKILL');
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

    it('kills the children of the backend on graceful shutdown', async () => {
        // `BackendApplication.gracefulShutdown` exits with code 1 on purpose.
        await expectTerminatedTree({ env: { [EXITING_BACKEND_GRACEFUL]: 'true' } }, 1);
    });

    (process.platform === 'win32' ? it.skip : it)('kills a child of the backend that ignores SIGTERM on graceful shutdown', async () => {
        await expectTerminatedTree({ env: { [EXITING_BACKEND_GRACEFUL]: 'true', [EXITING_BACKEND_CHILD_IGNORES_SIGTERM]: 'true' } }, 1);
    });

    describe('processes that ignore SIGTERM', () => {

        // `console.log` would color the PID when `FORCE_COLOR` is set, even though stdout is a pipe.
        const ignoringScript = 'process.on("SIGTERM", () => {}); process.stdout.write(process.pid + "\\n"); setInterval(() => {}, 1000);';

        function createProcessUtils(): ProcessUtils {
            const container = new Container();
            container.bind(ProcessUtils).toSelf().inSingletonScope();
            container.bind(ILogger).to(MockLogger).inSingletonScope();
            const processUtils = container.get(ProcessUtils);
            (processUtils as unknown as { unixForceKillDelay: number }).unixForceKillDelay = 1000;
            return processUtils;
        }

        /**
         * Starts a process that runs the given script, which prints the PID of a process that ignores SIGTERM on a line
         * once it is ready.
         */
        async function startProcess(script: string, options: cp.SpawnOptions = {}): Promise<{ pid: number, ignoringPid: number }> {
            const started = cp.spawn(process.execPath, ['-e', script], { ...options, stdio: ['ignore', 'pipe', 'ignore'] });
            childPids.push(started.pid!);
            const ignoringPid = await new Promise<number>((resolve, reject) => {
                let output = '';
                const onData = (data: Buffer): void => {
                    output += data;
                    const newline = output.indexOf('\n');
                    if (newline < 0) {
                        return;
                    }
                    started.stdout!.off('data', onData);
                    started.off('exit', onExit);
                    const line = output.substring(0, newline).trim();
                    if (/^\d+$/.test(line)) {
                        resolve(Number.parseInt(line, 10));
                    } else {
                        reject(new Error(`Expected the PID of the process that ignores SIGTERM, got ${JSON.stringify(output)}`));
                    }
                };
                const onExit = (): void => reject(new Error(`Exited before printing the PID of the process that ignores SIGTERM, got ${JSON.stringify(output)}`));
                started.stdout!.on('data', onData);
                started.once('exit', onExit);
            });
            childPids.push(ignoringPid);
            return { pid: started.pid!, ignoringPid };
        }

        (process.platform === 'win32' ? it.skip : it)('kills a descendant that ignores SIGTERM with SIGKILL', async () => {
            const processUtils = createProcessUtils();
            const { pid, ignoringPid } = await startProcess(`const child = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(ignoringScript)}],
                { stdio: ['ignore', 'pipe', 'ignore'] });
                child.stdout.once('data', data => process.stdout.write(data));
                setInterval(() => {}, 1000);`);

            processUtils.terminateProcessTree(pid);

            expect(isAlive(ignoringPid), 'the child should survive SIGTERM').to.be.true;
            expect(await isAliveAfterKill(pid), 'the parent should exit on SIGTERM').to.be.false;
            expect(await isAliveAfterKill(ignoringPid), 'the child should be killed with SIGKILL').to.be.false;
        });

        (process.platform === 'win32' ? it.skip : it)('kills a member of the group of the tree that ignores SIGTERM and was reparented with SIGKILL', async () => {
            const processUtils = createProcessUtils();
            // The group leader's grandchild outlives its parent, so it is no longer a descendant of the leader.
            const { pid, ignoringPid } = await startProcess(`const middle = require('child_process').spawn(process.execPath, ['-e',
                ${JSON.stringify(`const child = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(ignoringScript)}],
                    { stdio: ['ignore', 'pipe', 'ignore'] });
                    child.stdout.once('data', data => { process.stdout.write(data); process.exit(); });`)}],
                { stdio: ['ignore', 'pipe', 'ignore'] });
                let ignoringPid;
                middle.stdout.once('data', data => ignoringPid = data);
                middle.on('exit', () => process.stdout.write(ignoringPid));
                setInterval(() => {}, 1000);`, { detached: true });

            processUtils.terminateProcessTree(pid);

            expect(isAlive(ignoringPid), 'the group member should survive SIGTERM').to.be.true;
            expect(await isAliveAfterKill(pid), 'the group leader should exit on SIGTERM').to.be.false;
            expect(await isAliveAfterKill(ignoringPid), 'the group member should be killed with SIGKILL').to.be.false;
        });
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

        for (const listedPids of [processUtils['winGetChildPids'](process.pid), await processUtils['winGetChildPidsAsync'](process.pid)]) {
            expect(listedPids).to.include.members(childPids);
            // The PowerShell process that lists the children has exited by now, so it must not be listed.
            expect(listedPids.filter(pid => !isAlive(pid)), 'only live processes should be listed').to.be.empty;
        }
    });
});
