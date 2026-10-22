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
import { ProcessUtils } from './process-utils';
import { ILogger } from '../common';
import { MockLogger } from '../common/test/mock-logger';

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
        let killStub: sinon.SinonStub;

        beforeEach(() => {
            coreProcessManager['execFile'] = async () => ({ stdout: mockPsOutput, stderr: '' });
            killStub = sinon.stub();
            coreProcessManager['unixKill'] = killStub;
        });

        afterEach(() => {
            sinon.restore();
        });

        it('kills all descendants but not the process itself', async () => {
            await coreProcessManager['unixTerminateChildProcessTrees'](2);
            expect(killStub.args.map(([pid]) => pid)).members([40, 5, 6, 7]);
        });

        it('rejects when the processes cannot be listed', async () => {
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
