// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    markMobileProjectsPanelDismiss,
    QAAP_AUTH_OPEN_FIRST_REPO_EVENT,
    QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY,
} from './mobile-projects-open';
import {
    MobileShellLandingController,
    type MobileShellLandingHost,
} from './mobile-shell-landing-controller';
import { MobileShellSessionState } from './mobile-shell-session-state';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import type { MobileProjectsService } from './mobile-projects-service';

describe('mobile-shell-landing-controller', () => {

    const storage = new Map<string, string>();

    before(() => {
        enableJSDOM();
    });

    beforeEach(() => {
        storage.clear();
        document.body.className = '';
        const sessionStorage = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, value); },
            removeItem: (key: string) => { storage.delete(key); },
            clear: () => { storage.clear(); },
            key: () => null,
            length: 0,
        };
        (global as unknown as { sessionStorage: Storage }).sessionStorage = sessionStorage as Storage;
        Object.defineProperty(window, 'sessionStorage', { value: sessionStorage, configurable: true });
        window.location.hash = '#/Users/jc/.qaap/workspaces/demo/Mockup';
    });

    function createController(options: {
        mobileMqMatches?: boolean;
        host?: Partial<MobileShellLandingHost>;
        projectsService?: Partial<MobileProjectsService>;
    } = {}): {
        controller: MobileShellLandingController;
        host: MobileShellLandingHost & {
            calls: string[];
            panel?: Partial<MobileProjectsPanel>;
        };
        projectsService: MobileProjectsService & {
            listGithubRepositories: () => Promise<Array<{ github?: boolean }>>;
            openInCurrentWindow: (project: unknown) => void;
        };
    } {
        const calls: string[] = [];
        let panel: Partial<MobileProjectsPanel> | undefined;
        const host: MobileShellLandingHost & { calls: string[]; panel?: Partial<MobileProjectsPanel> } = {
            calls,
            get panel() { return panel; },
            getProjectsPanel: () => panel as MobileProjectsPanel | undefined,
            setProjectsPanel: value => { panel = value; calls.push('setProjectsPanel'); },
            ensureProjectsPanel: () => { calls.push('ensureProjectsPanel'); },
            hideProjectsPanel: () => { calls.push('hideProjectsPanel'); },
            tryBootstrapMobileAgentsChat: () => {
                calls.push('tryBootstrapMobileAgentsChat');
                return false;
            },
            ensureMainContentAfterWorkspaceReload: async () => { calls.push('ensureMainContentAfterWorkspaceReload'); },
            refreshProjectBootstrapFromWorkspace: () => { calls.push('refreshProjectBootstrapFromWorkspace'); },
            ensureDesktopWorkHubSessionsSidebarOpen: () => { calls.push('ensureDesktopWorkHubSessionsSidebarOpen'); },
            syncMobileHubPrimaryBottomChrome: () => { calls.push('syncMobileHubPrimaryBottomChrome'); },
            refreshBottomBar: () => { calls.push('refreshBottomBar'); },
            refreshWorkbenchTopBar: () => { calls.push('refreshWorkbenchTopBar'); },
            scheduleSnapAndUiRefresh: () => { calls.push('scheduleSnapAndUiRefresh'); },
            ...options.host,
        };
        Object.defineProperty(host, 'panel', {
            get: () => panel,
            set: (value: Partial<MobileProjectsPanel> | undefined) => { panel = value; },
        });
        const projectsService = {
            listGithubRepositories: async () => [],
            openInCurrentWindow: () => undefined,
            ...options.projectsService,
        } as MobileProjectsService & {
            listGithubRepositories: () => Promise<Array<{ github?: boolean }>>;
            openInCurrentWindow: (project: unknown) => void;
        };
        const controller = new MobileShellLandingController({
            host,
            projectsService,
            sessionState: new MobileShellSessionState(),
            mobileMq: { matches: options.mobileMqMatches ?? true } as MediaQueryList,
        });
        return { controller, host, projectsService };
    }

    it('syncFromStorage marks landing left for workspace routes', () => {
        const { controller } = createController();
        controller.syncFromStorage();
        expect(controller.landingLeftThisSession).to.equal(true);
        expect(document.body.classList.contains('theia-mobile-mod-landing')).to.equal(false);
    });

    it('isProjectsLandingSession is false after syncFromStorage on workspace routes', () => {
        const { controller } = createController();
        controller.syncFromStorage();
        expect(controller.isProjectsLandingSession()).to.equal(false);
    });

    it('onLandingDismissed persists agents surface and clears landing chrome', () => {
        const { controller, host } = createController();
        host.panel = {
            isHomeMode: () => true,
            dispose: () => { host.calls.push('dispose'); },
            node: { parentElement: null } as unknown as HTMLElement,
        } as unknown as MobileProjectsPanel;
        controller.onLandingDismissed();
        expect(controller.landingLeftThisSession).to.equal(true);
        expect(storage.get(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY)).to.equal('1');
        expect(document.body.classList.contains('theia-mobile-mod-landing')).to.equal(false);
        expect(host.calls).to.include('refreshProjectBootstrapFromWorkspace');
        expect(host.calls).to.include('tryBootstrapMobileAgentsChat');
    });

    it('openFirstRepoAfterAuth opens the only GitHub repo automatically', async () => {
        let opened: unknown;
        const { controller } = createController({
            projectsService: {
                listGithubRepositories: async () => [{ github: true }] as never,
                openInCurrentWindow: project => { opened = project; },
            },
        });
        await controller.openFirstRepoAfterAuth();
        expect(opened).to.deep.equal({ github: true });
    });

    it('openFirstRepoAfterAuth shows the repository picker when multiple repos exist', async () => {
        let dialogShown = false;
        const { controller, host } = createController({
            projectsService: {
                listGithubRepositories: async () => [{ github: true }, { github: true }] as never,
            },
            host: {
                getProjectsPanel: () => ({
                    showOpenRepositoryDialog: async () => { dialogShown = true; },
                } as unknown as MobileProjectsPanel),
            },
        });
        await controller.openFirstRepoAfterAuth();
        expect(host.calls).to.include('ensureProjectsPanel');
        expect(dialogShown).to.equal(true);
    });

    it('openFirstRepoAfterAuth is a no-op outside the mobile media query', async () => {
        let called = false;
        const { controller } = createController({
            mobileMqMatches: false,
            projectsService: {
                listGithubRepositories: async () => {
                    called = true;
                    return [];
                },
            },
        });
        await controller.openFirstRepoAfterAuth();
        expect(called).to.equal(false);
    });

    it('applyMobileProjectsPanelDismissAfterReload hydrates workspace content after dismiss', () => {
        markMobileProjectsPanelDismiss();
        const { controller, host } = createController();
        controller.applyMobileProjectsPanelDismissAfterReload();
        expect(controller.landingLeftThisSession).to.equal(true);
        expect(host.calls).to.include('hideProjectsPanel');
        expect(host.calls).to.include('ensureMainContentAfterWorkspaceReload');
        expect(host.calls).to.include('refreshProjectBootstrapFromWorkspace');
    });

    it('installAuthListener registers the OAuth handler once', () => {
        const events = new Map<string, EventListener>();
        (global as unknown as { window: Window }).window = {
            ...(global as unknown as { window: Window }).window,
            addEventListener: (type: string, listener: EventListener) => { events.set(type, listener); },
            removeEventListener: (type: string) => { events.delete(type); },
        } as unknown as Window;
        const dispose = new DisposableCollection();
        const { controller } = createController();
        controller.installAuthListener(dispose);
        controller.installAuthListener(dispose);
        expect(events.has(QAAP_AUTH_OPEN_FIRST_REPO_EVENT)).to.equal(true);
    });

});
