// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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
import { Container } from 'inversify';
import { ProcessUtils, UnixProcessInfo } from './process-utils.js';
import { ILogger } from '../common/index.js';
import { MockLogger } from '../common/test/mock-logger.js';

/** PPID, PID */
const mockPsOutput = `\
     5     6
    40     7
     1     2
     1     3
     2    40
     2     5
     0     1
`;

/** PID, PPID, PGID, start time */
function processTable(rows: [number, number, number, string][]): Map<number, UnixProcessInfo> {
    return new Map(rows.map(([pid, ppid, pgid, startTime]) => [pid, { pid, ppid, pgid, startTime }]));
}

describe('ProcessUtils', () => {

    let coreProcessManager: ProcessUtils;

    beforeEach(() => {
        const container = new Container();
        container.bind(ProcessUtils).toSelf().inSingletonScope();
        container.bind(ILogger).to(MockLogger).inSingletonScope();

        coreProcessManager = container.get(ProcessUtils);
    });

    it('ProcessUtils#unixGetChildrenRecursive', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        coreProcessManager['spawnSync'] = () => ({ stdout: mockPsOutput }) as any;
        const pids = coreProcessManager['unixGetChildrenRecursive'](2);
        expect(Array.from(pids)).members([40, 5, 6, 7]);
    });

    describe('#unixTerminateChildProcessTrees', () => {
        const delay = 2000;
        let clock: sinon.SinonFakeTimers;
        let killStub: sinon.SinonStub;
        let alivePids: Set<number>;
        let processes: Map<number, UnixProcessInfo>;

        function sigtermedPids(): number[] {
            return killStub.args.filter(([, signal]) => signal === undefined).map(([pid]) => pid);
        }

        function sigkilledPids(): number[] {
            return killStub.args.filter(([, signal]) => signal === 'SIGKILL').map(([pid]) => pid);
        }

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            killStub = sinon.stub();
            coreProcessManager['unixKill'] = killStub;
            // The tree of mockPsOutput under PID 2: 40, 5 and their children 7, 6.
            processes = processTable([
                [2, 1, 2, 'Thu Oct 29 10:00:00 2026'],
                [40, 2, 2, 'Thu Oct 29 10:00:01 2026'],
                [5, 2, 2, 'Thu Oct 29 10:00:01 2026'],
                [7, 40, 2, 'Thu Oct 29 10:00:02 2026'],
                [6, 5, 2, 'Thu Oct 29 10:00:02 2026'],
                [3, 1, 3, 'Thu Oct 29 10:00:00 2026']
            ]);
            coreProcessManager['unixListProcesses'] = () => processes;
            coreProcessManager['unixListProcessesAsync'] = async () => processes;
            alivePids = new Set([40, 5, 6, 7]);
            coreProcessManager['unixIsAlive'] = (pid: number) => alivePids.has(pid);
        });

        afterEach(() => {
            clock.restore();
            sinon.restore();
        });

        it('kills all descendants but not the process itself', async () => {
            alivePids.clear();
            await coreProcessManager['unixTerminateChildProcessTrees'](2);
            expect(sigtermedPids()).members([40, 5, 6, 7]);
            expect(sigkilledPids()).to.be.empty;
        });

        it('kills the descendants that are still running with SIGKILL after the delay', async () => {
            let resolved = false;
            const terminated = coreProcessManager['unixTerminateChildProcessTrees'](2).then(() => resolved = true);
            await clock.tickAsync(0);
            expect(sigtermedPids()).members([40, 5, 6, 7]);
            alivePids.delete(40);
            alivePids.delete(5);

            await clock.tickAsync(delay - 1);
            expect(sigkilledPids()).to.be.empty;
            expect(resolved).to.be.false;
            await clock.tickAsync(1);
            await terminated;
            expect(sigkilledPids()).members([6, 7]);
        });

        it('kills the processes of an earlier tree that are still running, even if they are no longer descendants', async () => {
            // 424244 was a child of 424243, which has exited since: it was reparented and is no longer in the tree of 2.
            processes.set(424243, { pid: 424243, ppid: 2, pgid: 424243, startTime: 'Thu Oct 29 10:00:03 2026' });
            processes.set(424244, { pid: 424244, ppid: 424243, pgid: 424243, startTime: 'Thu Oct 29 10:00:04 2026' });
            coreProcessManager['unixTerminateProcessTree'](424243);
            processes.delete(424243);
            processes.set(424244, { pid: 424244, ppid: 1, pgid: 424243, startTime: 'Thu Oct 29 10:00:04 2026' });
            alivePids = new Set([424244]);

            const terminated = coreProcessManager['unixTerminateChildProcessTrees'](2);
            await clock.tickAsync(delay);
            await terminated;
            expect(sigkilledPids()).members([424244]);
        });

        it('also kills the reparented members of the process group that the process leads', async () => {
            // 9 was a child of a process of the group that exited: it is no longer a descendant of 2.
            processes.set(9, { pid: 9, ppid: 1, pgid: 2, startTime: 'Thu Oct 29 10:00:05 2026' });
            alivePids = new Set([9]);

            const terminated = coreProcessManager['unixTerminateChildProcessTrees'](2);
            await clock.tickAsync(delay);
            await terminated;
            expect(sigtermedPids()).members([40, 5, 6, 7, 9]);
            expect(sigkilledPids()).members([9]);
        });

        it('measures the delay from the start of the call, including the time it takes to list the processes', async () => {
            coreProcessManager['unixListProcessesAsync'] = () => new Promise(resolve => setTimeout(() => resolve(processes), 1500));

            const terminated = coreProcessManager['unixTerminateChildProcessTrees'](2);
            await clock.tickAsync(1500);
            expect(sigtermedPids()).members([40, 5, 6, 7]);
            await clock.tickAsync(delay - 1500 - 1);
            expect(sigkilledPids()).to.be.empty;
            // The listing before SIGKILL takes another 1500 ms.
            await clock.tickAsync(1 + 1500);
            await terminated;
            expect(sigkilledPids()).members([40, 5, 6, 7]);
        });

        it('only sends SIGTERM when the start times cannot be listed', async () => {
            coreProcessManager['unixListProcessesAsync'] = async () => { throw new Error('ps: bad -o argument'); };
            coreProcessManager['execFile'] = async () => ({ stdout: mockPsOutput, stderr: '' });
            await coreProcessManager['unixTerminateChildProcessTrees'](2);
            expect(sigtermedPids()).members([40, 5, 6, 7]);
            await clock.tickAsync(delay);
            expect(sigkilledPids()).to.be.empty;
        });

        it('rejects when the processes cannot be listed', async () => {
            coreProcessManager['unixListProcessesAsync'] = async () => { throw new Error('ps not found'); };
            coreProcessManager['execFile'] = async () => { throw new Error('ps not found'); };
            let error: unknown;
            await coreProcessManager['unixTerminateChildProcessTrees'](2).catch(e => error = e);
            expect(error).to.be.instanceOf(Error);
            expect(killStub.called).to.be.false;
        });
    });

    describe('#unixTerminateProcessTree', () => {
        let originalKill: typeof process.kill;
        let errorStub: sinon.SinonStub;

        function throwingKill(code: string): typeof process.kill {
            return (() => {
                const error = new Error(`kill ${code}`) as NodeJS.ErrnoException;
                error.code = code;
                throw error;
            }) as typeof process.kill;
        }

        beforeEach(() => {
            originalKill = process.kill;
            const mockLogger = (coreProcessManager as unknown as { logger: ILogger }).logger;
            errorStub = sinon.stub(mockLogger, 'error');
            // One child plus the parent; report the parent as its own group leader so the `kill(-ppid)` branch runs too.
            coreProcessManager['unixGetChildrenRecursive'] = () => new Set([424242]);
            coreProcessManager['unixGetPGID'] = (pid: number) => pid;
            // Without a listing of the processes, they are not killed with SIGKILL later.
            coreProcessManager['unixTryListProcesses'] = () => undefined;
        });

        afterEach(() => {
            process.kill = originalKill;
            sinon.restore();
        });

        it('does not throw or log when processes in the tree are already gone (ESRCH)', () => {
            process.kill = throwingKill('ESRCH');
            expect(() => coreProcessManager['unixTerminateProcessTree'](424243)).to.not.throw();
            expect(errorStub.called).to.be.false;
        });

        it('logs unexpected kill errors (e.g. EPERM) without throwing', () => {
            process.kill = throwingKill('EPERM');
            expect(() => coreProcessManager['unixTerminateProcessTree'](424243)).to.not.throw();
            expect(errorStub.called).to.be.true;
        });

        it('does not throw when a kill rejects with a value that has no code (e.g. undefined)', () => {
            const thrown: unknown = undefined;
            process.kill = (() => { throw thrown; }) as typeof process.kill;
            expect(() => coreProcessManager['unixTerminateProcessTree'](424243)).to.not.throw();
            expect(errorStub.called).to.be.true;
        });
    });

    describe('#unixTerminateProcessTree with processes that survive SIGTERM', () => {
        const delay = 5000;
        let clock: sinon.SinonFakeTimers;
        let killStub: sinon.SinonStub;
        let alivePids: Set<number>;
        let processes: Map<number, UnixProcessInfo>;
        let listStub: sinon.SinonStub;
        let listAsyncStub: sinon.SinonStub;

        function sigkilledPids(): number[] {
            return killStub.args.filter(([, signal]) => signal === 'SIGKILL').map(([pid]) => pid);
        }

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            killStub = sinon.stub();
            coreProcessManager['unixKill'] = killStub;
            coreProcessManager['unixGetChildrenRecursive'] = () => expect.fail('the tree should come from the listing');
            coreProcessManager['unixGetPGID'] = () => expect.fail('the group should come from the listing');
            // 424243 leads a group; 424246 is a member of that group that was reparented to init.
            processes = processTable([
                [424243, 1000, 424243, 'Thu Oct 29 10:00:00 2026'],
                [424244, 424243, 424243, 'Thu Oct 29 10:00:01 2026'],
                [424245, 424244, 424243, 'Thu Oct 29 10:00:01 2026'],
                [424246, 1, 424243, 'Thu Oct 29 10:00:02 2026'],
                [424247, 1, 424247, 'Thu Oct 29 10:00:02 2026']
            ]);
            listStub = sinon.stub().callsFake(() => processes);
            listAsyncStub = sinon.stub().callsFake(async () => processes);
            coreProcessManager['unixListProcesses'] = listStub;
            coreProcessManager['unixListProcessesAsync'] = listAsyncStub;
            alivePids = new Set([424243, 424244, 424245, 424246, 424247]);
            coreProcessManager['unixIsAlive'] = (pid: number) => alivePids.has(pid);
        });

        afterEach(() => {
            clock.restore();
            sinon.restore();
        });

        it('kills the processes of the tree and of its group that are still running with SIGKILL after the delay', async () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            expect(listStub.calledOnce).to.be.true;
            expect(killStub.args.map(([pid]) => pid)).members([424244, 424245, -424243, 424243]);
            expect(sigkilledPids()).to.be.empty;

            alivePids.delete(424243);
            await clock.tickAsync(delay - 1);
            expect(sigkilledPids()).to.be.empty;
            await clock.tickAsync(1);
            expect(sigkilledPids()).members([424244, 424245, 424246]);
        });

        it('spares a PID that a new process has taken since the tree was terminated', async () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            processes = new Map(processes);
            processes.set(424245, { pid: 424245, ppid: 1, pgid: 424245, startTime: 'Thu Oct 29 10:00:04 2026' });
            await clock.tickAsync(delay);
            expect(sigkilledPids()).members([424243, 424244, 424246]);
        });

        it('does not list the processes again when all of them have exited', async () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            alivePids.clear();
            await clock.tickAsync(delay);
            expect(listAsyncStub.called).to.be.false;
            expect(sigkilledPids()).to.be.empty;
        });

        it('only sends SIGTERM when the processes cannot be listed', async () => {
            const mockLogger = (coreProcessManager as unknown as { logger: ILogger }).logger;
            const warnStub = sinon.stub(mockLogger, 'warn');
            listStub.throws(new Error('ps: bad -o argument'));
            coreProcessManager['unixGetChildrenRecursive'] = () => new Set([424244, 424245]);
            coreProcessManager['unixGetPGID'] = () => 1;
            expect(() => coreProcessManager['unixTerminateProcessTree'](424243)).to.not.throw();
            expect(killStub.args.map(([pid]) => pid)).members([424243, 424244, 424245]);
            expect(warnStub.called).to.be.true;
            await clock.tickAsync(delay);
            expect(sigkilledPids()).to.be.empty;
        });

        it('checks again for the targets that are not due yet when the timer fires early', async () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            // As if the timer's clock were ahead of the clock of the deadlines.
            for (const target of coreProcessManager['unixForceKillTargets'].values()) {
                target.deadline += 1;
            }
            await clock.tickAsync(delay);
            expect(sigkilledPids()).to.be.empty;
            await clock.tickAsync(1);
            expect(sigkilledPids()).members([424243, 424244, 424245, 424246]);
        });

        it('kills the processes of a later tree at their own deadline', async () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            await clock.tickAsync(1000);
            processes.set(424248, { pid: 424248, ppid: 1000, pgid: 424247, startTime: 'Thu Oct 29 10:00:03 2026' });
            alivePids.add(424248);
            coreProcessManager['unixTerminateProcessTree'](424248);

            await clock.tickAsync(delay - 1000);
            expect(sigkilledPids()).members([424243, 424244, 424245, 424246]);
            await clock.tickAsync(1000);
            expect(sigkilledPids()).members([424243, 424244, 424245, 424246, 424248]);
        });

        it('kills the processes of earlier trees right away, once their start time is checked, when the current process exits', () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            processes = new Map(processes);
            processes.set(424245, { pid: 424245, ppid: 1, pgid: 424245, startTime: 'Thu Oct 29 10:00:04 2026' });
            coreProcessManager['unixGetChildrenRecursive'] = () => new Set();
            coreProcessManager['unixGetPGID'] = () => 1;

            coreProcessManager['unixTerminateProcessTree'](process.pid);
            expect(sigkilledPids()).members([424243, 424244, 424246]);
            expect(coreProcessManager['unixForceKillTargets'].size).to.equal(0);
        });

        it('keeps the targets that are due until the processes have been listed', async () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            listAsyncStub.callsFake(() => new Promise(resolve => setTimeout(() => resolve(processes), 500)));
            await clock.tickAsync(delay);
            expect(Array.from(coreProcessManager['unixForceKillTargets'].keys())).members([424243, 424244, 424245, 424246]);
            expect(sigkilledPids()).to.be.empty;
            await clock.tickAsync(500);
            expect(sigkilledPids()).members([424243, 424244, 424245, 424246]);
            expect(coreProcessManager['unixForceKillTargets'].size).to.equal(0);
        });

        it('does not kill the targets again that the exit handler killed while the processes were being listed', async () => {
            coreProcessManager['unixTerminateProcessTree'](424243);
            listAsyncStub.callsFake(() => new Promise(resolve => setTimeout(() => resolve(processes), 500)));
            await clock.tickAsync(delay);
            coreProcessManager['unixGetChildrenRecursive'] = () => new Set();
            coreProcessManager['unixGetPGID'] = () => 1;
            coreProcessManager['unixTerminateProcessTree'](process.pid);
            expect(sigkilledPids()).members([424243, 424244, 424245, 424246]);
            await clock.tickAsync(500);
            expect(sigkilledPids()).to.have.lengthOf(4);
        });

        it('does not kill the tree of the current process with SIGKILL', async () => {
            coreProcessManager['unixGetChildrenRecursive'] = () => new Set();
            coreProcessManager['unixGetPGID'] = () => 1;
            coreProcessManager['unixTerminateProcessTree'](process.pid);
            await clock.tickAsync(delay);
            expect(listStub.called).to.be.false;
            expect(sigkilledPids()).to.be.empty;
        });
    });

    it('ProcessUtils#unixParseProcesses', () => {
        const processes = coreProcessManager['unixParseProcesses'](`\
    1     0     1 Thu Oct 29 09:58:12 2026
42424     1 42424 Thu Oct 29 10:00:01 2026
`);
        expect(Array.from(processes.values())).to.deep.equal([
            { pid: 1, ppid: 0, pgid: 1, startTime: 'Thu Oct 29 09:58:12 2026' },
            { pid: 42424, ppid: 1, pgid: 42424, startTime: 'Thu Oct 29 10:00:01 2026' }
        ]);
    });

    describe('#winTerminateProcessTree', () => {
        let taskkillStub: sinon.SinonStub;
        let warnStub: sinon.SinonStub;

        beforeEach(() => {
            const mockLogger = (coreProcessManager as unknown as { logger: ILogger }).logger;
            warnStub = sinon.stub(mockLogger, 'warn');
            taskkillStub = sinon.stub();
            coreProcessManager['winTaskkillTrees'] = taskkillStub;
        });

        afterEach(() => {
            sinon.restore();
        });

        it('kills the tree of another process including its root', () => {
            coreProcessManager['winGetChildPids'] = () => expect.fail('children should not be listed');
            coreProcessManager['winTerminateProcessTree'](424243);
            expect(taskkillStub.calledOnceWithExactly([424243])).to.be.true;
        });

        it('kills only the trees of the children of the current process', () => {
            coreProcessManager['winGetChildPids'] = () => [424244, 424245];
            coreProcessManager['winTerminateProcessTree'](process.pid);
            expect(taskkillStub.calledOnceWithExactly([424244, 424245])).to.be.true;
        });

        it('does not run taskkill when the current process has no children', () => {
            coreProcessManager['winGetChildPids'] = () => [];
            coreProcessManager['winTerminateProcessTree'](process.pid);
            expect(taskkillStub.called).to.be.false;
        });

        it('falls back to killing the whole tree when the children of the current process cannot be listed', () => {
            coreProcessManager['winGetChildPids'] = () => { throw new Error('powershell.exe not found'); };
            expect(() => coreProcessManager['winTerminateProcessTree'](process.pid)).to.not.throw();
            expect(taskkillStub.calledOnceWithExactly([process.pid])).to.be.true;
            expect(warnStub.called).to.be.true;
        });
    });

    describe('#winTerminateChildProcessTrees', () => {
        let taskkillStub: sinon.SinonStub;

        beforeEach(() => {
            taskkillStub = sinon.stub();
            coreProcessManager['winTaskkillTrees'] = taskkillStub;
        });

        afterEach(() => {
            sinon.restore();
        });

        it('kills the trees of the children of the process', async () => {
            coreProcessManager['winGetChildPidsAsync'] = async () => [424244, 424245];
            await coreProcessManager['winTerminateChildProcessTrees'](process.pid);
            expect(taskkillStub.calledOnceWithExactly([424244, 424245])).to.be.true;
        });

        it('does not run taskkill when the process has no children', async () => {
            coreProcessManager['winGetChildPidsAsync'] = async () => [];
            await coreProcessManager['winTerminateChildProcessTrees'](process.pid);
            expect(taskkillStub.called).to.be.false;
        });

        it('rejects when the children cannot be listed', async () => {
            coreProcessManager['winGetChildPidsAsync'] = async () => { throw new Error('powershell.exe not found'); };
            let error: unknown;
            await coreProcessManager['winTerminateChildProcessTrees'](process.pid).catch(e => error = e);
            expect(error).to.be.instanceOf(Error);
            expect(taskkillStub.called).to.be.false;
        });
    });

    describe('#winGetChildPids', () => {
        let originalSystemRoot: string | undefined;
        let spawnSyncStub: sinon.SinonStub;
        let execFileStub: sinon.SinonStub;

        beforeEach(() => {
            originalSystemRoot = process.env.SystemRoot;
            spawnSyncStub = sinon.stub().returns({ stdout: '1234\r\n5678\r\n\r\n' });
            coreProcessManager['spawnSync'] = spawnSyncStub;
            execFileStub = sinon.stub().resolves({ stdout: '1234\r\n5678\r\n\r\n', stderr: '' });
            coreProcessManager['execFile'] = execFileStub;
        });

        afterEach(() => {
            if (originalSystemRoot === undefined) {
                delete process.env.SystemRoot;
            } else {
                process.env.SystemRoot = originalSystemRoot;
            }
        });

        it('parses the PowerShell output', () => {
            expect(coreProcessManager['winGetChildPids'](42)).to.deep.equal([1234, 5678]);
        });

        it('parses the PowerShell output asynchronously', async () => {
            expect(await coreProcessManager['winGetChildPidsAsync'](42)).to.deep.equal([1234, 5678]);
            expect(spawnSyncStub.called).to.be.false;
        });

        it('runs PowerShell from the Windows directory with a timeout', async () => {
            process.env.SystemRoot = 'C:\\Windows';
            coreProcessManager['winGetChildPids'](42);
            await coreProcessManager['winGetChildPidsAsync'](42);
            for (const stub of [spawnSyncStub, execFileStub]) {
                const [file, , options] = stub.firstCall.args;
                expect(file).to.equal('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
                expect(options.timeout).to.be.greaterThan(0);
            }
        });

        it('excludes the PowerShell process itself, the console host and the children of a previous process with the same PID', async () => {
            coreProcessManager['winGetChildPids'](42);
            await coreProcessManager['winGetChildPidsAsync'](42);
            for (const stub of [spawnSyncStub, execFileStub]) {
                const command: string = stub.firstCall.args[1].at(-1);
                expect(command).to.contain("Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId=42'");
                expect(command).to.contain('ParentProcessId=42');
                expect(command).to.contain('$_.ProcessId -ne $PID');
                expect(command).to.contain("$_.Name -ne 'conhost.exe'");
                expect(command).to.contain('$_.CreationDate -ge $parent.CreationDate');
            }
        });

        it('runs PowerShell from the PATH when the Windows directory is unknown', () => {
            delete process.env.SystemRoot;
            coreProcessManager['winGetChildPids'](42);
            expect(spawnSyncStub.firstCall.args[0]).to.equal('powershell.exe');
        });
    });
});
