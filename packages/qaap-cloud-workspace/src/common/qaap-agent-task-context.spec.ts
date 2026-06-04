// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { prependAgentTaskContextToPrompt, QAAP_TASK_CONTEXT_MARKER } from './qaap-agent-task-context';

describe('prependAgentTaskContextToPrompt', () => {
    it('returns the prompt unchanged when no context is provided', () => {
        expect(prependAgentTaskContextToPrompt('Fix the bug')).to.equal('Fix the bug');
        expect(prependAgentTaskContextToPrompt('Fix the bug', '  ', '')).to.equal('Fix the bug');
    });

    it('prepends global context when present', () => {
        const result = prependAgentTaskContextToPrompt('Fix the bug', 'Qaap env context');
        expect(result).to.contain(QAAP_TASK_CONTEXT_MARKER);
        expect(result).to.contain('Qaap env context');
        expect(result.endsWith('Fix the bug')).to.equal(true);
    });

    it('prepends project info under a heading when present', () => {
        const result = prependAgentTaskContextToPrompt('Fix the bug', undefined, 'Uses Vite');
        expect(result).to.contain('# Project context');
        expect(result).to.contain('Uses Vite');
    });

    it('combines global context and project info in order', () => {
        const result = prependAgentTaskContextToPrompt('Do it', 'GLOBAL', 'PROJECT');
        expect(result.indexOf('GLOBAL')).to.be.lessThan(result.indexOf('PROJECT'));
        expect(result.indexOf('PROJECT')).to.be.lessThan(result.indexOf('Do it'));
    });

    it('is idempotent — does not stack context when the marker is already present', () => {
        const once = prependAgentTaskContextToPrompt('Do it', 'GLOBAL');
        const twice = prependAgentTaskContextToPrompt(once, 'GLOBAL');
        expect(twice).to.equal(once);
    });
});
