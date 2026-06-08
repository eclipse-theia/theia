// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyBackendInteractionModeToPrompt,
    defaultComposerModeId,
    describeComposerInteractionMode,
    QAAP_BACKEND_INTERACTION_MODES,
    reconcileComposerModeId,
    resolveStickyComposerModes,
} from './qaap-sticky-composer-mode';

describe('qaap-sticky-composer-mode', () => {

    it('applyBackendInteractionModeToPrompt leaves agent mode unchanged', () => {
        expect(applyBackendInteractionModeToPrompt('fix tests', 'agent')).to.equal('fix tests');
        expect(applyBackendInteractionModeToPrompt('fix tests', undefined)).to.equal('fix tests');
    });

    it('applyBackendInteractionModeToPrompt prefixes plan and ask modes', () => {
        expect(applyBackendInteractionModeToPrompt('refactor auth', 'plan')).to.contain('[QAIQ Plan mode]');
        expect(applyBackendInteractionModeToPrompt('refactor auth', 'plan')).to.contain('refactor auth');
        expect(applyBackendInteractionModeToPrompt('what is X?', 'ask')).to.contain('[QAIQ Ask mode]');
    });

    it('resolveStickyComposerModes always exposes QAIQ product modes', () => {
        expect(resolveStickyComposerModes('qaiq', undefined).map(mode => mode.id))
            .to.deep.equal(['agent', 'plan', 'ask']);
    });

    it('describeComposerInteractionMode explains active plan/ask modes', () => {
        expect(describeComposerInteractionMode('agent')).to.equal(undefined);
        expect(describeComposerInteractionMode('plan')).to.contain('Plan mode');
        expect(describeComposerInteractionMode('ask')).to.contain('Ask mode');
    });

    it('reconcileComposerModeId falls back to default', () => {
        expect(reconcileComposerModeId('missing', QAAP_BACKEND_INTERACTION_MODES, undefined))
            .to.equal(defaultComposerModeId(QAAP_BACKEND_INTERACTION_MODES));
    });
});
