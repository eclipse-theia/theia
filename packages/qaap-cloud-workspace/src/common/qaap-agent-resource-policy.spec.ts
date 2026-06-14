// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    QAAP_AGENT_MAX_MEMORY_MB_ENV,
    resolveAgentResourcePolicy,
    wrapAgentCommandWithResourceLimits,
} from './qaap-agent-resource-policy';

describe('resolveAgentResourcePolicy', () => {
    it('returns defaults for an empty env', () => {
        const policy = resolveAgentResourcePolicy({});
        expect(policy.maxConcurrentPerRepo).to.equal(1);
        expect(policy.idleTimeoutMs).to.equal(20 * 60 * 1000);
        expect(policy.wallTimeoutMs).to.equal(30 * 60 * 1000);
        expect(policy.killGraceMs).to.equal(5_000);
        expect(policy.maxMemoryMb).to.be.undefined;
    });

    it('reads optional memory and cpu caps', () => {
        const policy = resolveAgentResourcePolicy({
            [QAAP_AGENT_MAX_MEMORY_MB_ENV]: '512',
            QAAP_AGENT_MAX_CPU_PERCENT: '50',
        });
        expect(policy.maxMemoryMb).to.equal(512);
        expect(policy.maxCpuPercent).to.equal(50);
    });
});

describe('wrapAgentCommandWithResourceLimits', () => {
    it('returns the command unchanged when no memory cap is set', () => {
        const policy = resolveAgentResourcePolicy({});
        expect(wrapAgentCommandWithResourceLimits('qaiq -p hi', policy)).to.equal('qaiq -p hi');
    });

    it('prefixes ulimit on Unix when maxMemoryMb is configured', function(): void {
        if (process.platform === 'win32') {
            this.skip();
        }
        const policy = resolveAgentResourcePolicy({ [QAAP_AGENT_MAX_MEMORY_MB_ENV]: '512' });
        expect(wrapAgentCommandWithResourceLimits('qaiq -p hi', policy))
            .to.equal('ulimit -v 524288 2>/dev/null; qaiq -p hi');
    });
});
