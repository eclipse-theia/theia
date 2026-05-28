// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyBackendInteractionModeToPrompt,
    defaultComposerModeId,
    QAAP_BACKEND_INTERACTION_MODES,
    reconcileComposerModeId,
} from './qaap-sticky-composer-mode';

describe('qaap-sticky-composer-mode', () => {

    it('applyBackendInteractionModeToPrompt leaves agent mode unchanged', () => {
        expect(applyBackendInteractionModeToPrompt('fix tests', 'agent')).to.equal('fix tests');
        expect(applyBackendInteractionModeToPrompt('fix tests', undefined)).to.equal('fix tests');
    });

    it('applyBackendInteractionModeToPrompt prefixes plan and ask modes', () => {
        expect(applyBackendInteractionModeToPrompt('refactor auth', 'plan')).to.contain('[Plan mode');
        expect(applyBackendInteractionModeToPrompt('refactor auth', 'plan')).to.contain('refactor auth');
        expect(applyBackendInteractionModeToPrompt('what is X?', 'ask')).to.contain('[Ask mode');
    });

    it('reconcileComposerModeId falls back to default', () => {
        expect(reconcileComposerModeId('missing', QAAP_BACKEND_INTERACTION_MODES, undefined))
            .to.equal(defaultComposerModeId(QAAP_BACKEND_INTERACTION_MODES));
    });
});
