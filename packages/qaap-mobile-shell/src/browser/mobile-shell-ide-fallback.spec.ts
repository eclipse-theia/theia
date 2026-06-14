// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import {
    clearPreferDesktopIde,
    markPreferDesktopIde,
    peekPreferDesktopIde,
} from './mobile-projects-open';
import type {
    MobileShellIdeFallbackController as MobileShellIdeFallbackControllerType,
    MobileShellIdeFallbackHost,
} from './mobile-shell-ide-fallback';
import { MobileShellSessionState } from './mobile-shell-session-state';
import type { MobileProjectsPanel } from './mobile-projects-panel';

describe('mobile-shell-ide-fallback', () => {

    let MobileShellIdeFallbackController: typeof MobileShellIdeFallbackControllerType;
    let disableJSDOM: (() => void) | undefined;

    before(() => {
        disableJSDOM = enableJSDOM();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellIdeFallbackController = require('./mobile-shell-ide-fallback').MobileShellIdeFallbackController;
    });

    after(() => {
        disableJSDOM?.();
    });

    beforeEach(() => {
        clearPreferDesktopIde();
        document.body.className = '';
        const raf = (cb: FrameRequestCallback): number => {
            cb(0);
            return 1;
        };
        (global as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = raf;
        (global as unknown as { window: Window }).window.requestAnimationFrame = raf;
    });

    const createController = (overrides?: {
        host?: Partial<MobileShellIdeFallbackHost>;
        sessionState?: MobileShellSessionState;
    }): {
        controller: MobileShellIdeFallbackControllerType;
        host: MobileShellIdeFallbackHost & { calls: string[]; panel?: MobileProjectsPanel };
        sessionState: MobileShellSessionState;
    } => {
        const calls: string[] = [];
        let panel: MobileProjectsPanel | undefined;
        const panelNode = document.createElement('div');
        document.body.append(panelNode);
        const sessionState = overrides?.sessionState ?? new MobileShellSessionState();
        const host = {
            calls,
            get panel() { return panel; },
            isMobileActive: () => true,
            shouldActivateMobileLayout: () => true,
            enterMobileLayout: () => { calls.push('enterMobileLayout'); },
            leaveMobileLayout: () => { calls.push('leaveMobileLayout'); },
            onMediaChange: () => { calls.push('onMediaChange'); },
            cancelAgentsBootstrap: () => { calls.push('cancelAgentsBootstrap'); },
            getProjectsPanel: () => panel,
            setProjectsPanel: (next: MobileProjectsPanel | undefined) => { panel = next; },
            tryBootstrapMobileAgentsChat: () => {
                calls.push('tryBootstrapMobileAgentsChat');
                return false;
            },
            restoreAgentsSurfaceAfterReload: async () => { calls.push('restoreAgentsSurfaceAfterReload'); },
            syncMobileHubPrimaryBottomChrome: () => { calls.push('syncMobileHubPrimaryBottomChrome'); },
            refreshBottomBar: () => { calls.push('refreshBottomBar'); },
            refreshWorkbenchTopBar: () => { calls.push('refreshWorkbenchTopBar'); },
            forceCenterColumnFullWidth: () => { calls.push('forceCenterColumnFullWidth'); },
            scheduleSnapAndUiRefresh: () => { calls.push('scheduleSnapAndUiRefresh'); },
            ensureDesktopSidePanelSizes: async () => { calls.push('ensureDesktopSidePanelSizes'); },
            requestFullShellRelayout: () => { calls.push('requestFullShellRelayout'); },
            ...overrides?.host,
        } as MobileShellIdeFallbackHost & { calls: string[]; panel?: MobileProjectsPanel };
        panel = {
            hide: () => { calls.push('panel.hide'); },
            dispose: () => { calls.push('panel.dispose'); },
            node: panelNode,
        } as unknown as MobileProjectsPanel;
        const controller = new MobileShellIdeFallbackController({
            host,
            sessionState: overrides?.sessionState ?? sessionState,
        });
        return { controller, host, sessionState };
    };

    it('openDesktopIde marks desktop IDE preference and disposes the projects panel', () => {
        const { controller, host } = createController();
        controller.openDesktopIde();
        expect(peekPreferDesktopIde()).to.equal(true);
        expect(host.calls).to.include('cancelAgentsBootstrap');
        expect(host.calls).to.include('panel.hide');
        expect(host.calls).to.include('panel.dispose');
        expect(host.panel).to.equal(undefined);
        expect(document.body.classList.contains('theia-mobile-mod-landing')).to.equal(false);
    });

    it('returnToAgentsFromDesktopIde clears desktop IDE preference and restores agents surface', async () => {
        markPreferDesktopIde();
        const { controller, host, sessionState } = createController();
        controller.returnToAgentsFromDesktopIde();
        expect(peekPreferDesktopIde()).to.equal(false);
        expect(sessionState.landingLeftThisSession).to.equal(true);
        expect(host.calls).to.include('cancelAgentsBootstrap');
        await new Promise<void>(resolve => { setTimeout(resolve, 0); });
        expect(host.calls).to.include('restoreAgentsSurfaceAfterReload');
    });

    it('returnToAgentsFromDesktopIde skips restore when bootstrap already started', () => {
        markPreferDesktopIde();
        const { controller, host } = createController();
        host.tryBootstrapMobileAgentsChat = () => {
            host.calls.push('tryBootstrapMobileAgentsChat');
            return true;
        };
        controller.returnToAgentsFromDesktopIde();
        expect(host.calls).to.include('tryBootstrapMobileAgentsChat');
        expect(host.calls).to.not.include('restoreAgentsSurfaceAfterReload');
    });
});
