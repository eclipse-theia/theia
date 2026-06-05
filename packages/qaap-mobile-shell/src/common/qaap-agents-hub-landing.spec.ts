// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildAgentsHubIdleConversationSummary,
    isAgentsHubIdleConversationSummary,
    QAAP_AGENTS_HUB_IDLE_CONVERSATION_ID,
    QAAP_AGENTS_HUB_LANDING_ENABLED,
    QAAP_AGENTS_HUB_QUICK_ACTIONS,
    QAAP_AGENTS_HUB_RECENT_LIMIT,
} from './qaap-agents-hub-landing';

describe('qaap-agents-hub-landing', () => {
    it('keeps the landing feature enabled for mobile Work Hub', () => {
        expect(QAAP_AGENTS_HUB_LANDING_ENABLED).to.equal(true);
        expect(QAAP_AGENTS_HUB_RECENT_LIMIT).to.equal(3);
    });

    it('builds a stable idle conversation placeholder for the Agents shell', () => {
        const summary = buildAgentsHubIdleConversationSummary('/workspace/qaap');
        expect(summary.id).to.equal(QAAP_AGENTS_HUB_IDLE_CONVERSATION_ID);
        expect(summary.cwd).to.equal('/workspace/qaap');
        expect(isAgentsHubIdleConversationSummary(summary)).to.equal(true);
        expect(isAgentsHubIdleConversationSummary({ ...summary, id: 'other' })).to.equal(false);
    });

    it('exposes agent-first quick actions for the empty transcript', () => {
        expect(QAAP_AGENTS_HUB_QUICK_ACTIONS.length).to.be.at.least(3);
        const ids = QAAP_AGENTS_HUB_QUICK_ACTIONS.map(action => action.id);
        expect(ids).to.include.members(['fix-bug', 'review-pr', 'add-tests']);
        for (const action of QAAP_AGENTS_HUB_QUICK_ACTIONS) {
            expect(action.icon.trim()).to.not.equal('');
            expect(action.labelDefault.trim()).to.not.equal('');
            expect(action.promptDefault.trim()).to.not.equal('');
        }
    });
});
