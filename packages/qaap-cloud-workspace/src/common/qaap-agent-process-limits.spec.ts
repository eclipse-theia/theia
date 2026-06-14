// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    QAAP_AGENT_IDLE_TIMEOUT_MS_ENV,
    QAAP_AGENT_KILL_GRACE_MS_ENV,
    QAAP_AGENT_TASK_TIMEOUT_MS_ENV,
    QAAP_AGENT_WALL_TIMEOUT_MS_ENV,
    resolveIdleTimeoutMs,
    resolveKillGraceMs,
    resolveWallTimeoutMs,
} from './qaap-agent-process-limits';

describe('resolveIdleTimeoutMs', () => {
    it('defaults to 20 minutes', () => {
        expect(resolveIdleTimeoutMs({})).to.equal(20 * 60 * 1000);
    });

    it('reads QAAP_AGENT_IDLE_TIMEOUT_MS', () => {
        expect(resolveIdleTimeoutMs({ [QAAP_AGENT_IDLE_TIMEOUT_MS_ENV]: '60000' })).to.equal(60_000);
    });
});

describe('resolveWallTimeoutMs', () => {
    it('defaults to 30 minutes', () => {
        expect(resolveWallTimeoutMs({})).to.equal(30 * 60 * 1000);
    });

    it('prefers QAAP_AGENT_WALL_TIMEOUT_MS over the legacy alias', () => {
        expect(resolveWallTimeoutMs({
            [QAAP_AGENT_WALL_TIMEOUT_MS_ENV]: '120000',
            [QAAP_AGENT_TASK_TIMEOUT_MS_ENV]: '60000',
        })).to.equal(120_000);
    });

    it('accepts QAAP_AGENT_TASK_TIMEOUT_MS as legacy alias', () => {
        expect(resolveWallTimeoutMs({ [QAAP_AGENT_TASK_TIMEOUT_MS_ENV]: '90000' })).to.equal(90_000);
    });
});

describe('resolveKillGraceMs', () => {
    it('defaults to 5 seconds', () => {
        expect(resolveKillGraceMs({})).to.equal(5_000);
    });

    it('reads QAAP_AGENT_KILL_GRACE_MS', () => {
        expect(resolveKillGraceMs({ [QAAP_AGENT_KILL_GRACE_MS_ENV]: '2000' })).to.equal(2_000);
    });
});
