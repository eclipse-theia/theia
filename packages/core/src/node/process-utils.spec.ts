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
});
