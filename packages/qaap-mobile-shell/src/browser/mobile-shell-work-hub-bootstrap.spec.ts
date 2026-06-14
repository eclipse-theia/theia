// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import type { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import {
    clearPreferAgentsSurface,
    clearPreferDesktopIde,
    markPreferDesktopIde,
    QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY,
    shouldBootstrapMobileAgentsChat,
} from './mobile-projects-open';
import type {
    MobileShellWorkHubBootstrapController as MobileShellWorkHubBootstrapControllerType,
    MobileShellWorkHubBootstrapHost,
} from './mobile-shell-work-hub-bootstrap';
import { MobileShellSessionState } from './mobile-shell-session-state';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import type { MobileProjectsService } from './mobile-projects-service';
import type { WorkspaceService } from '@theia/workspace/lib/browser';

describe('mobile-shell-work-hub-bootstrap', () => {

    let MobileShellWorkHubBootstrapController: typeof MobileShellWorkHubBootstrapControllerType;
    let disableJSDOM: (() => void) | undefined;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM?.();
        disableJSDOM = undefined;
    });

    beforeEach(() => {
        disableJSDOM?.();
        disableJSDOM = enableJSDOM();
        document.body.className = '';
        const storage = new Map<string, string>();
        const sessionStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, value); },
            removeItem: (key: string) => { storage.delete(key); },
            clear: () => { storage.clear(); },
            key: () => null,
            length: 0,
        };
        Object.defineProperty(window, 'sessionStorage', { value: sessionStorage, configurable: true });
        (global as unknown as { sessionStorage: Storage }).sessionStorage = sessionStorage as Storage;
        window.location.hash = '#/Users/jc/.qaap/workspaces/demo/Mockup';
        clearPreferDesktopIde();
        clearPreferAgentsSurface();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellWorkHubBootstrapController = require('./mobile-shell-work-hub-bootstrap').MobileShellWorkHubBootstrapController;
    });

    function createController(options: {
        host?: Partial<MobileShellWorkHubBootstrapHost>;
        workspaceOpened?: boolean;
        sessionState?: MobileShellSessionState;
    } = {}): {
        controller: MobileShellWorkHubBootstrapControllerType;
        host: MobileShellWorkHubBootstrapHost & { calls: string[] };
        sessionState: MobileShellSessionState;
    } {
        const calls: string[] = [];
        let mobileActive = true;
        const sessionState = options.sessionState ?? new MobileShellSessionState();
        let projectsPanel: MobileProjectsPanel | undefined;
        const host: MobileShellWorkHubBootstrapHost & { calls: string[] } = {
            calls,
            isMobileActive: () => mobileActive,
            getProjectsPanel: () => projectsPanel,
            setProjectsPanel: panel => { projectsPanel = panel; },
            shouldActivateMobileLayout: () => true,
            enterMobileLayout: () => { calls.push('enterMobileLayout'); mobileActive = true; },
            onMediaChange: () => { calls.push('onMediaChange'); },
            scheduleSnapAndUiRefresh: () => { calls.push('scheduleSnapAndUiRefresh'); },
            collapseMobileSideSheets: async () => { calls.push('collapseMobileSideSheets'); },
            ensureWelcomeInMainArea: async () => { calls.push('ensureWelcomeInMainArea'); },
            ensureDesktopSidePanelSizes: async () => { calls.push('ensureDesktopSidePanelSizes'); },
            createProjectsPanel: homeMode => ({
                isHomeMode: () => homeMode,
                isVisible: () => false,
                show: async () => undefined,
                hide: () => undefined,
                dispose: () => undefined,
                node: document.createElement('div'),
                getHubView: () => 'tasks',
                preferComposerSurface: () => undefined,
            }) as unknown as MobileProjectsPanel,
            appendProjectsPanelToShell: () => { calls.push('appendProjectsPanelToShell'); },
            disposeProjectsPanelForDesktopIde: () => { calls.push('disposeProjectsPanelForDesktopIde'); },
            syncMobileHubPrimaryBottomChrome: () => { calls.push('syncMobileHubPrimaryBottomChrome'); },
            refreshBottomBar: () => { calls.push('refreshBottomBar'); },
            refreshWorkbenchTopBar: () => { calls.push('refreshWorkbenchTopBar'); },
            ensureDesktopWorkHubSessionsSidebarOpen: () => { calls.push('ensureDesktopWorkHubSessionsSidebarOpen'); },
            applyLandingChrome: () => { calls.push('applyLandingChrome'); },
            releaseMobileWorkHubBootGuardWhenReady: async () => { calls.push('releaseMobileWorkHubBootGuardWhenReady'); },
            isProjectsLandingSession: () => false,
            hasPendingHubAction: () => false,
            applyMobileProjectsPanelDismissAfterReload: () => { calls.push('applyMobileProjectsPanelDismissAfterReload'); },
            refreshProjectBootstrapFromWorkspace: () => { calls.push('refreshProjectBootstrapFromWorkspace'); },
            ...options.host,
        };
        const shell = {
            mainPanel: { widgets: () => [] },
            closeWidget: async () => undefined,
        } as unknown as ApplicationShell;
        const workspaceService = {
            opened: options.workspaceOpened ?? true,
            ready: Promise.resolve(),
        } as WorkspaceService;
        const controller = new MobileShellWorkHubBootstrapController({
            host,
            shell,
            workspaceService,
            sessionState,
            projectsService: {
                setHubView: () => undefined,
            } as unknown as MobileProjectsService,
        });
        return { controller, host, sessionState };
    }

    it('tryBootstrapMobileAgentsChat returns false when desktop IDE is preferred', () => {
        markPreferDesktopIde();
        const { controller } = createController();
        expect(controller.tryBootstrapMobileAgentsChat()).to.equal(false);
    });

    it('tryBootstrapMobileAgentsChat starts agents bootstrap for workspace routes', async () => {
        expect(shouldBootstrapMobileAgentsChat()).to.equal(true);
        const { controller, host, sessionState } = createController();
        expect(controller.tryBootstrapMobileAgentsChat()).to.equal(true);
        expect(sessionState.landingLeftThisSession).to.equal(true);
        await new Promise<void>(resolve => { setTimeout(resolve, 0); });
        expect(host.calls).to.include('refreshProjectBootstrapFromWorkspace');
    });

    it('tryBootstrapMobileAgentsChat restores when tasks panel is visible but shell is empty', () => {
        const panel = {
            isVisible: () => true,
            isHomeMode: () => true,
            getHubView: () => 'tasks' as const,
            isAgentsHubShellActive: () => false,
            isAgentsHubExecutionSurfaceReady: () => false,
            node: document.createElement('div'),
        } as unknown as MobileProjectsPanel;
        const { controller, sessionState } = createController({
            host: {
                getProjectsPanel: () => panel,
            },
        });
        expect(controller.tryBootstrapMobileAgentsChat()).to.equal(true);
        expect(sessionState.agentsBootstrapStarted).to.equal(true);
    });

    it('tryBootstrapMobileAgentsChat restores when landing CSS is set but execution shell is empty', () => {
        const root = document.createElement('div');
        root.classList.add('theia-mod-agents-hub-landing');
        const panel = {
            isVisible: () => true,
            isHomeMode: () => true,
            getHubView: () => 'tasks' as const,
            isAgentsHubShellActive: () => false,
            isAgentsHubExecutionSurfaceReady: () => false,
            node: root,
        } as unknown as MobileProjectsPanel;
        const { controller, sessionState } = createController({
            host: {
                getProjectsPanel: () => panel,
            },
        });
        expect(controller.tryBootstrapMobileAgentsChat()).to.equal(true);
        expect(sessionState.agentsBootstrapStarted).to.equal(true);
    });

    it('tryBootstrapMobileAgentsChat short-circuits when agents hub execution surface is ready', () => {
        const projectsPanel = {
            isVisible: () => true,
            isHomeMode: () => true,
            getHubView: () => 'tasks' as const,
            isAgentsHubShellActive: () => true,
            isAgentsHubExecutionSurfaceReady: () => true,
            node: document.createElement('div'),
        } as unknown as MobileProjectsPanel;
        const { controller, sessionState } = createController({
            host: {
                getProjectsPanel: () => projectsPanel,
            },
        });
        expect(controller.tryBootstrapMobileAgentsChat()).to.equal(true);
        expect(sessionState.agentsBootstrapStarted).to.equal(false);
    });

    it('cancelAgentsBootstrap prevents stale restore completion', async () => {
        const { controller, host } = createController();
        expect(controller.tryBootstrapMobileAgentsChat()).to.equal(true);
        controller.cancelAgentsBootstrap();
        await controller.restoreAgentsSurfaceAfterReload(0);
        expect(host.calls).to.not.include('releaseMobileWorkHubBootGuardWhenReady');
    });

    it('persistAgentsSurfaceForActiveSession marks agents preference when composer header is active', () => {
        const storage = window.sessionStorage;
        storage.removeItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY);
        document.body.classList.add('theia-mobile-mod-workhub-composer-header');
        const sessionState = new MobileShellSessionState();
        sessionState.landingLeftThisSession = true;
        const { controller, host } = createController({ sessionState });
        controller.persistAgentsSurfaceForActiveSession();
        expect(storage.getItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY)).to.equal('1');
        expect(host.calls.length).to.equal(0);
    });

    it('ensureProjectsPanel creates and mounts a panel when none exists', () => {
        const { controller, host } = createController();
        controller.ensureProjectsPanel(true);
        expect(host.calls).to.include('appendProjectsPanelToShell');
        expect(host.getProjectsPanel()).to.not.equal(undefined);
    });

    it('showMobileProjectsHome applies landing chrome after show', async () => {
        const { controller, host } = createController({
            host: {
                getProjectsPanel: () => ({
                    isHomeMode: () => true,
                    isVisible: () => false,
                    show: async () => { host.calls.push('panel.show'); },
                    hide: () => undefined,
                    dispose: () => undefined,
                    node: document.createElement('div'),
                }) as unknown as MobileProjectsPanel,
            },
        });
        await controller.showMobileProjectsHome('tasks');
        expect(document.body.classList.contains('theia-mobile-mod-landing')).to.equal(true);
        expect(host.calls).to.include('applyLandingChrome');
        expect(host.calls).to.include('panel.show');
    });

});
