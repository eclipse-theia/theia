// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { MobileShellSessionState } from './mobile-shell-session-state';

describe('mobile-shell-session-state', () => {

    it('starts with runtime defaults', () => {
        const session = new MobileShellSessionState();
        expect(session.landingLeftThisSession).to.equal(false);
        expect(session.transcriptOpenedFromWorkHubLanding).to.equal(false);
        expect(session.agentsBootstrapStarted).to.equal(false);
        expect(session.agentsBootstrapEpoch).to.equal(0);
    });

    it('cancelAgentsBootstrap bumps epoch and clears the in-flight flag', () => {
        const session = new MobileShellSessionState();
        session.agentsBootstrapStarted = true;
        session.cancelAgentsBootstrap();
        expect(session.agentsBootstrapEpoch).to.equal(1);
        expect(session.agentsBootstrapStarted).to.equal(false);
        session.cancelAgentsBootstrap();
        expect(session.agentsBootstrapEpoch).to.equal(2);
    });

    it('keeps landing and transcript flags independent', () => {
        const session = new MobileShellSessionState();
        session.landingLeftThisSession = true;
        session.transcriptOpenedFromWorkHubLanding = true;
        session.cancelAgentsBootstrap();
        expect(session.landingLeftThisSession).to.equal(true);
        expect(session.transcriptOpenedFromWorkHubLanding).to.equal(true);
    });

});
