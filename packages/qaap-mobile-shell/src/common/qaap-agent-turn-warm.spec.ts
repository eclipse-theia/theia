// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { warmAgentTurnPath, type QaapAgentTurnWarmHooks } from './qaap-agent-turn-warm';

describe('warmAgentTurnPath', () => {

    it('warms live transport and schedules runner warm for a cwd', () => {
        let transportWarmed = false;
        const hooks: QaapAgentTurnWarmHooks = {
            warmLiveTransport: () => { transportWarmed = true; },
        };
        warmAgentTurnPath('/workspace/demo', hooks);
        expect(transportWarmed).to.equal(true);
    });

    it('skips runner warm when cwd is empty but still opens transport', () => {
        let transportWarmed = false;
        warmAgentTurnPath('   ', {
            warmLiveTransport: () => { transportWarmed = true; },
        });
        expect(transportWarmed).to.equal(true);
    });
});
