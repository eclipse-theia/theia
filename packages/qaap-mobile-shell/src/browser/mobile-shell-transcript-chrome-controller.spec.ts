// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import type {
    MobileShellTranscriptChromeController as MobileShellTranscriptChromeControllerType,
    MobileShellTranscriptChromeHost,
} from './mobile-shell-transcript-chrome-controller';
import { MobileShellSessionState } from './mobile-shell-session-state';
import type { MobileProjectsPanel } from './mobile-projects-panel';

describe('mobile-shell-transcript-chrome-controller', () => {

    let MobileShellTranscriptChromeController: typeof MobileShellTranscriptChromeControllerType;
    let disableJSDOM: (() => void) | undefined;

    before(() => {
        disableJSDOM = enableJSDOM();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellTranscriptChromeController = require('./mobile-shell-transcript-chrome-controller').MobileShellTranscriptChromeController;
    });

    after(() => {
        disableJSDOM?.();
    });

    beforeEach(() => {
        document.body.className = '';
        window.dispatchEvent = (() => true) as typeof window.dispatchEvent;
    });

    const createController = (): {
        controller: MobileShellTranscriptChromeControllerType;
        host: MobileShellTranscriptChromeHost & { calls: string[] };
        sessionState: MobileShellSessionState;
        panel: MobileProjectsPanel;
    } => {
        const calls: string[] = [];
        const sessionState = new MobileShellSessionState();
        const panel = {
            hide: () => { calls.push('panel.hide'); },
        } as unknown as MobileProjectsPanel;
        const host = {
            calls,
            getProjectsPanel: () => panel,
            openMobileWorkHubLanding: async () => { calls.push('openMobileWorkHubLanding'); },
            syncMobileHubPrimaryBottomChrome: () => { calls.push('syncMobileHubPrimaryBottomChrome'); },
            refreshBottomBar: () => { calls.push('refreshBottomBar'); },
            refreshWorkbenchTopBar: () => { calls.push('refreshWorkbenchTopBar'); },
        };
        const controller = new MobileShellTranscriptChromeController({ host, sessionState });
        return { controller, host, sessionState, panel };
    };

    it('onEnterActiveTranscript is a no-op when transcript chrome is already active', () => {
        document.body.classList.add('theia-mobile-mod-active-transcript');
        const { controller, host, sessionState } = createController();
        controller.onEnterActiveTranscript();
        expect(sessionState.transcriptOpenedFromWorkHubLanding).to.equal(false);
        expect(host.calls).to.not.include('panel.hide');
    });

    it('onEnterActiveTranscript hides landing when transcript opens from Work Hub landing', () => {
        document.body.classList.add('theia-mobile-mod-landing');
        const { controller, host, sessionState } = createController();
        controller.onEnterActiveTranscript();
        expect(sessionState.transcriptOpenedFromWorkHubLanding).to.equal(true);
        expect(sessionState.landingLeftThisSession).to.equal(true);
        expect(host.calls).to.include('panel.hide');
        expect(document.body.classList.contains('theia-mobile-mod-active-transcript')).to.equal(true);
        expect(document.body.classList.contains('theia-mobile-mod-landing')).to.equal(false);
    });

    it('onExitActiveTranscript restores Work Hub when transcript opened from landing', async () => {
        const { controller, host, sessionState } = createController();
        sessionState.transcriptOpenedFromWorkHubLanding = true;
        sessionState.landingLeftThisSession = true;
        document.body.classList.add('theia-mobile-mod-active-transcript');
        await controller.onExitActiveTranscript();
        expect(sessionState.transcriptOpenedFromWorkHubLanding).to.equal(false);
        expect(sessionState.landingLeftThisSession).to.equal(false);
        expect(host.calls).to.include('openMobileWorkHubLanding');
        expect(document.body.classList.contains('theia-mobile-mod-active-transcript')).to.equal(false);
    });
});
