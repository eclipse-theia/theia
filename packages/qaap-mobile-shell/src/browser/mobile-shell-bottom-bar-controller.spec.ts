// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar/status-bar';
import type {
    MobileShellBottomBarController as MobileShellBottomBarControllerType,
    MobileShellBottomBarHost,
} from './mobile-shell-bottom-bar-controller';
import type { MobileProjectsService } from './mobile-projects-service';
import type { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';

const MOBILE_BOTTOM_OPEN_CLASS = 'theia-mod-mobile-bottom-open';
const MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO = 0.38;
const MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO = 0.28;

describe('mobile-shell-bottom-bar-controller', () => {

    let MobileShellBottomBarController: typeof MobileShellBottomBarControllerType;

    before(() => {
        enableJSDOM();
        // Lumino loads at require time — JSDOM must be enabled first.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellBottomBarController = require('./mobile-shell-bottom-bar-controller').MobileShellBottomBarController;
    });

    function createController(options: {
        host?: Partial<MobileShellBottomBarHost>;
        shell?: Partial<ApplicationShell>;
    } = {}): {
        controller: MobileShellBottomBarControllerType;
        host: MobileShellBottomBarHost;
        shell: ApplicationShell;
    } {
        const shellClasses = new Set<string>();
        const shellNode = {
            classList: {
                add(name: string) { shellClasses.add(name); },
                remove(name: string) { shellClasses.delete(name); },
                toggle(name: string, force?: boolean) {
                    const next = force ?? !shellClasses.has(name);
                    if (next) {
                        shellClasses.add(name);
                    } else {
                        shellClasses.delete(name);
                    }
                },
                contains(name: string) { return shellClasses.has(name); },
            },
            querySelector: () => null,
        };
        const bottomPanel = {
            isHidden: false,
            isEmpty: false,
            hasClass: () => false,
            parent: undefined as unknown,
        };
        let bottomExpanded = false;
        const shell = {
            node: shellNode,
            bottomPanel,
            mainPanel: { parent: undefined as unknown },
            isExpanded: (area: string) => area === 'bottom' && bottomExpanded,
            collapsePanel: async (area: string) => {
                if (area === 'bottom') {
                    bottomExpanded = false;
                }
            },
            topPanel: { node: { getBoundingClientRect: () => ({ bottom: 48 }) } },
            ...(options.shell ?? {}),
        } as unknown as ApplicationShell;

        const host: MobileShellBottomBarHost = {
            isMobileActive: () => true,
            getLandingLeftThisSession: () => false,
            getProjectsCount: () => 0,
            getProjectsPanel: () => undefined,
            isMobileWorkHubLandingVisible: () => false,
            isPullRequestPanelShown: () => false,
            isMobileAgentSheetVisible: () => false,
            isMobileExploreSheetVisible: () => false,
            getActivePreviewWidget: () => undefined,
            isSidePanelSheetCollapsedInDom: () => true,
            scheduleSnapAndUiRefresh: () => undefined,
            refreshWorkbenchTopBar: () => undefined,
            hideProjectsPanel: () => undefined,
            hidePullRequestPanel: () => undefined,
            toggleProjectsPanel: async () => undefined,
            togglePullRequestPanel: async () => undefined,
            openMobileWorkHubLanding: async () => undefined,
            collapseMobileSidePanels: async () => undefined,
            dismissSheetsAsync: async () => undefined,
            settleMobileSidePanelsCollapsed: () => undefined,
            onProjectsPanelOpen: async () => undefined,
            refreshProjectsCount: async () => undefined,
            toggleMobileAgentSheet: async () => undefined,
            toggleMobilePreview: async () => undefined,
            toggleMobileExploreSheet: async () => undefined,
            openPullRequestPanel: () => undefined,
            executeAndDismiss: async () => undefined,
            relayoutMainPreviewWidgets: () => undefined,
            conversationsStart: () => undefined,
            inboxStreamStart: () => undefined,
            ...options.host,
        };

        const controller = new MobileShellBottomBarController({
            host,
            shell,
            statusBar: {} as StatusBarImpl,
            commands: { getCommand: () => undefined, isEnabled: () => false, executeCommand: async () => undefined } as unknown as CommandRegistry,
            projectsService: {} as MobileProjectsService,
            projectBootstrap: {} as QaapProjectBootstrapService,
        });
        return { controller, host, shell };
    }

    it('isTerminalBottomPanelOpen reflects bottom panel visibility', () => {
        const { controller, shell } = createController();
        expect(controller.isTerminalBottomPanelOpen()).to.equal(true);

        (shell.bottomPanel as { isHidden: boolean }).isHidden = true;
        expect(controller.isTerminalBottomPanelOpen()).to.equal(false);

        (shell.bottomPanel as { isHidden: boolean }).isHidden = false;
        (shell.bottomPanel as { isEmpty: boolean }).isEmpty = true;
        expect(controller.isTerminalBottomPanelOpen()).to.equal(false);
    });

    it('resolveMobileBottomSplitSizes clamps main area ratio', () => {
        const splitNode = { clientHeight: 1000 };
        const split = {
            node: splitNode,
            relativeSizes: () => [0.1, 0.9],
            setRelativeSizes: () => undefined,
            widgets: [] as unknown[],
            handles: [{ classList: { contains: () => false }, offsetTop: 620 }],
            isVisible: true,
        };
        const { controller, shell } = createController({
            shell: {
                mainPanel: { parent: split } as unknown as ApplicationShell['mainPanel'],
                bottomPanel: {
                    parent: split,
                    isHidden: false,
                    isEmpty: false,
                    hasClass: () => false,
                } as unknown as ApplicationShell['bottomPanel'],
            },
        });
        split.widgets = [shell.mainPanel, shell.bottomPanel];

        const [main, bottom] = controller.resolveMobileBottomSplitSizes();
        expect(main).to.be.at.least(MOBILE_BOTTOM_SPLIT_MAIN_MIN_RATIO);
        expect(main + bottom).to.be.closeTo(1, 0.001);
    });

    it('resolveMobileBottomSplitSizes uses default ratio when split height is zero', () => {
        const { controller } = createController();
        const [main, bottom] = controller.resolveMobileBottomSplitSizes();
        expect(bottom).to.equal(MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO);
        expect(main).to.equal(1 - MOBILE_BOTTOM_SPLIT_DEFAULT_BOTTOM_RATIO);
    });

    it('updateMobileShellStateClasses toggles MOBILE_BOTTOM_OPEN_CLASS', () => {
        const { controller, shell } = createController({
            shell: {
                isExpanded: (area: string) => area === 'bottom',
            },
        });
        controller.updateMobileShellStateClasses();
        expect(shell.node.classList.contains(MOBILE_BOTTOM_OPEN_CLASS)).to.equal(true);

        (shell as { isExpanded: (area: string) => boolean }).isExpanded = () => false;
        controller.updateMobileShellStateClasses();
        expect(shell.node.classList.contains(MOBILE_BOTTOM_OPEN_CLASS)).to.equal(false);
    });

    it('shouldDismissSheetsForButton keeps agent, projects, and pr sheets open', () => {
        const { controller } = createController();
        expect(controller.shouldDismissSheetsForButton('agent')).to.equal(false);
        expect(controller.shouldDismissSheetsForButton('projects')).to.equal(false);
        expect(controller.shouldDismissSheetsForButton('pr')).to.equal(false);
        expect(controller.shouldDismissSheetsForButton('terminal')).to.equal(true);
        expect(controller.shouldDismissSheetsForButton('preview')).to.equal(true);
        expect(controller.shouldDismissSheetsForButton('explore')).to.equal(true);
    });
});
