// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    markMobileProjectsLeftLanding,
    markPreferAgentsSurface,
    setMobileActiveTranscriptChrome,
    setMobileLandingHubListChrome,
} from './mobile-projects-open';
import type { MobileProjectsHubView } from './mobile-projects-types';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import { MobileShellSessionState } from './mobile-shell-session-state';

export interface MobileShellTranscriptChromeHost {
    getProjectsPanel(): MobileProjectsPanel | undefined;
    openMobileWorkHubLanding(view: MobileProjectsHubView): Promise<void>;
    syncMobileHubPrimaryBottomChrome(): void;
    refreshBottomBar(): void;
    refreshWorkbenchTopBar(): void;
}

export interface MobileShellTranscriptChromeOptions {
    host: MobileShellTranscriptChromeHost;
    sessionState: MobileShellSessionState;
}

/** Active transcript body chrome: enter/exit overlays that replace Work Hub landing. */
export class MobileShellTranscriptChromeController {

    protected readonly host: MobileShellTranscriptChromeHost;
    protected readonly sessionState: MobileShellSessionState;

    constructor(options: MobileShellTranscriptChromeOptions) {
        this.host = options.host;
        this.sessionState = options.sessionState;
    }

    /** Transcript on body replaces the Work Hub landing (`theia-mobile-mod-landing` hides it). */
    onEnterActiveTranscript(): void {
        if (document.body.classList.contains('theia-mobile-mod-active-transcript')) {
            setMobileActiveTranscriptChrome(true);
            return;
        }
        this.sessionState.transcriptOpenedFromWorkHubLanding = document.body.classList.contains('theia-mobile-mod-landing');
        if (this.sessionState.transcriptOpenedFromWorkHubLanding) {
            this.sessionState.landingLeftThisSession = true;
            markMobileProjectsLeftLanding();
            document.body.classList.remove('theia-mobile-mod-landing');
            setMobileLandingHubListChrome(false);
            this.host.getProjectsPanel()?.hide();
        }
        setMobileActiveTranscriptChrome(true);
        markPreferAgentsSurface();
        this.host.syncMobileHubPrimaryBottomChrome();
        this.host.refreshBottomBar();
        this.host.refreshWorkbenchTopBar();
    }

    async onExitActiveTranscript(): Promise<void> {
        setMobileActiveTranscriptChrome(false);
        if (this.sessionState.transcriptOpenedFromWorkHubLanding) {
            this.sessionState.transcriptOpenedFromWorkHubLanding = false;
            this.sessionState.landingLeftThisSession = false;
            await this.host.openMobileWorkHubLanding('tasks');
            return;
        }
        this.host.refreshBottomBar();
        this.host.refreshWorkbenchTopBar();
    }
}
