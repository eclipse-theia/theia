// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveAgentDisplayLabel } from './qaap-agent-ui';
import { QAIQ_AGENT_ID } from '../common/qaap-agent-task-client';

describe('qaap-agent-ui', () => {

    it('resolveAgentDisplayLabel prefers brand label then fallback', () => {
        expect(resolveAgentDisplayLabel('codex')).to.equal('Codex');
        expect(resolveAgentDisplayLabel('unknown', 'Custom')).to.equal('Custom');
        expect(resolveAgentDisplayLabel(QAIQ_AGENT_ID)).to.equal('QAIQ');
    });
});
