// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import type { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import type {
    MobileShellHubNavigationController as MobileShellHubNavigationControllerType,
    MobileShellHubNavigationHost,
} from './mobile-shell-hub-navigation-controller';
import { MobileShellSessionState } from './mobile-shell-session-state';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import type { MobileProjectsService } from './mobile-projects-service';

describe('mobile-shell-hub-navigation-controller', () => {

    let MobileShellHubNavigationController: typeof MobileShellHubNavigationControllerType;
    let disableJSDOM: (() => void) | undefined;

    before(() => {
        disableJSDOM = enableJSDOM();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellHubNavigationController = require('./mobile-shell-hub-navigation-controller').MobileShellHubNavigationController;
    });

    after(() => {
        disableJSDOM?.();
    });

    beforeEach(() => {
        document.body.className = '';
        document.body.innerHTML = '';
        window.dispatchEvent = (() => true) as typeof window.dispatchEvent;
    });

    const createController = (overrides?: {
        host?: Partial<MobileShellHubNavigationHost>;
        panel?: Partial<MobileProjectsPanel>;
    }): {
        controller: MobileShellHubNavigationControllerType;
        host: MobileShellHubNavigationHost & { calls: string[] };
        sessionState: MobileShellSessionState;
    } => {
        const calls: string[] = [];
        const panel = {
            isVisible: () => true,
            isHomeMode: () => true,
            isProjectDetailView: () => false,
            closeProjectDetail: () => { calls.push('closeProjectDetail'); },
            preferComposerSurface: () => { calls.push('preferComposerSurface'); },
            navigateHubTab: () => { calls.push('navigateHubTab'); },
            ...overrides?.panel,
        } as unknown as MobileProjectsPanel;
        const sessionState = new MobileShellSessionState();
        const host = {
            calls,
            isMobileActive: () => true,
            enterMobileLayout: () => { calls.push('enterMobileLayout'); },
            getProjectsPanel: () => panel,
            applyLandingChrome: () => { calls.push('applyLandingChrome'); },
            warmLiveTransport: () => { calls.push('warmLiveTransport'); },
            startActiveTasks: () => { calls.push('startActiveTasks'); },
            syncMobileHubPrimaryBottomChrome: () => { calls.push('syncMobileHubPrimaryBottomChrome'); },
            refreshBottomBar: () => { calls.push('refreshBottomBar'); },
            refreshWorkbenchTopBar: () => { calls.push('refreshWorkbenchTopBar'); },
            ensureDesktopWorkHubSessionsSidebarOpen: () => { calls.push('ensureDesktopWorkHubSessionsSidebarOpen'); },
            hidePullRequestPanel: () => { calls.push('hidePullRequestPanel'); },
            dismissSheetsAsync: async () => { calls.push('dismissSheetsAsync'); },
            collapseMobileSidePanels: async () => { calls.push('collapseMobileSidePanels'); },
            showMobileProjectsHome: async () => { calls.push('showMobileProjectsHome'); },
            ...overrides?.host,
        } as MobileShellHubNavigationHost & { calls: string[] };
        const shell = {
            isExpanded: () => false,
            collapsePanel: async () => undefined,
        } as unknown as ApplicationShell;
        const projectsService = {
            setHubView: () => undefined,
        } as unknown as MobileProjectsService;
        const controller = new MobileShellHubNavigationController({
            host,
            shell,
            projectsService,
            sessionState,
        });
        return { controller, host, sessionState };
    };

    it('dismissMobileAgentTranscriptOverlays removes transcript roots from body', () => {
        const overlay = document.createElement('div');
        overlay.className = 'theia-mobile-agent-transcript-root';
        document.body.append(overlay);
        const { controller } = createController();
        controller.dismissMobileAgentTranscriptOverlays();
        expect(document.body.querySelector('.theia-mobile-agent-transcript-root')).to.equal(null);
    });

    it('isMobileWorkHubLandingVisible requires landing chrome and visible home panel', () => {
        const { controller } = createController();
        expect(controller.isMobileWorkHubLandingVisible()).to.equal(false);
        document.body.classList.add('theia-mobile-mod-landing');
        expect(controller.isMobileWorkHubLandingVisible()).to.equal(true);
    });

    it('syncHubLandingNavigation applies hub tab when landing panel is already visible', () => {
        document.body.classList.add('theia-mobile-mod-landing');
        const { controller, host, sessionState } = createController();
        sessionState.landingLeftThisSession = true;
        expect(controller.syncHubLandingNavigation('tasks')).to.equal(true);
        expect(sessionState.landingLeftThisSession).to.equal(false);
        expect(host.calls).to.include('navigateHubTab');
        expect(host.calls).to.include('startActiveTasks');
        expect(host.calls).to.include('applyLandingChrome');
    });

    it('syncHubLandingNavigation returns false when the home panel is not visible yet', () => {
        const { controller, host } = createController({
            panel: {
                isVisible: () => false,
            },
        });
        expect(controller.syncHubLandingNavigation('tasks')).to.equal(false);
        expect(host.calls).to.not.include('navigateHubTab');
    });
});
