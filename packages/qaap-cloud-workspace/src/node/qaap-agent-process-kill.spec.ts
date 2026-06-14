// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { spawn, type ChildProcess } from 'child_process';
import {
    agentProcessSpawnOptions,
    scheduleAgentProcessTreeKill,
    signalAgentProcessTree,
} from './qaap-agent-process-kill';

describe('agentProcessSpawnOptions', () => {
    it('requests detached spawn on Unix for kill-tree semantics', () => {
        const options = agentProcessSpawnOptions(false);
        if (process.platform === 'win32') {
            expect(options.detached).to.be.false;
        } else {
            expect(options.detached).to.be.true;
        }
    });
});

describe('signalAgentProcessTree', () => {
    it('does not throw when pid is missing', () => {
        const child = { pid: undefined } as ChildProcess;
        expect(() => signalAgentProcessTree(child, 'SIGTERM')).to.not.throw();
    });
});

describe('scheduleAgentProcessTreeKill', () => {
    it('terminates a detached Unix child process', async function(): Promise<void> {
        if (process.platform === 'win32') {
            this.skip();
        }
        const child = spawn('sleep', ['30'], agentProcessSpawnOptions(false));
        const exited = new Promise<number | null>(resolve => {
            child.on('close', code => resolve(code));
        });
        const timer = scheduleAgentProcessTreeKill(child, 100);
        const code = await exited;
        if (timer) {
            clearTimeout(timer);
        }
        expect(code).to.not.equal(0);
    });
});
