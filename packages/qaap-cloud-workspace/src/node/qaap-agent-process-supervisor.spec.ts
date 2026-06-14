// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { QaapAgentProcessSupervisor } from './qaap-agent-process-supervisor';

describe('QaapAgentProcessSupervisor', () => {
    const supervisor = new QaapAgentProcessSupervisor();

    it('wraps commands with ulimit when QAAP_AGENT_MAX_MEMORY_MB is set', function(): void {
        if (process.platform === 'win32') {
            this.skip();
        }
        const command = supervisor.wrapCommand('qaiq -p hi', supervisor.resolvePolicy({
            QAAP_AGENT_MAX_MEMORY_MB: '256',
        }));
        expect(command).to.equal('ulimit -v 262144 2>/dev/null; qaiq -p hi');
    });

    it('fires idle timeout callbacks', async () => {
        let reason: string | undefined;
        const handle = supervisor.startWatch('task-idle', { pid: 1 } as import('child_process').ChildProcess, {
            isStillRunning: () => true,
            isIdlePaused: () => false,
            onTimeout: (_kind, message) => {
                reason = message;
            },
        }, {
            QAAP_AGENT_IDLE_TIMEOUT_MS: '20',
            QAAP_AGENT_WALL_TIMEOUT_MS: '60000',
        });
        await new Promise(resolve => setTimeout(resolve, 40));
        handle.release();
        expect(reason).to.include('without output');
    });

    it('fires wall timeout callbacks', async () => {
        let reason: string | undefined;
        const handle = supervisor.startWatch('task-wall', { pid: 1 } as import('child_process').ChildProcess, {
            isStillRunning: () => true,
            isIdlePaused: () => false,
            onTimeout: (_kind, message) => {
                reason = message;
            },
        }, {
            QAAP_AGENT_IDLE_TIMEOUT_MS: '60000',
            QAAP_AGENT_WALL_TIMEOUT_MS: '20',
        });
        handle.bumpIdleTimer();
        await new Promise(resolve => setTimeout(resolve, 40));
        handle.release();
        expect(reason).to.include('wall-clock limit');
    });
});
