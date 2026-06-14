// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import type { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import type { CommandRegistry } from '@theia/core/lib/common/command';
import type {
    MobileShellSideSheetController as MobileShellSideSheetControllerType,
    MobileShellSideSheetHost,
} from './mobile-shell-side-sheet-controller';
import type { MobileShellBottomBarController } from './mobile-shell-bottom-bar-controller';

describe('mobile-shell-side-sheet-controller', () => {

    let MobileShellSideSheetController: typeof MobileShellSideSheetControllerType;
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
        document.body.innerHTML = '';
        const raf = (cb: FrameRequestCallback): number => {
            cb(0);
            return 1;
        };
        (global as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = raf;
        (global as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame = () => undefined;
        (global as unknown as { window: Window }).window.requestAnimationFrame = raf;
        (global as unknown as { window: Window }).window.cancelAnimationFrame = () => undefined;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellSideSheetController = require('./mobile-shell-side-sheet-controller').MobileShellSideSheetController;
    });

    function createController(options: {
        host?: Partial<MobileShellSideSheetHost>;
        shell?: Partial<ApplicationShell>;
    } = {}): {
        controller: MobileShellSideSheetControllerType;
        host: MobileShellSideSheetHost & { calls: string[] };
        shell: ApplicationShell;
    } {
        const calls: string[] = [];
        const expanded = new Set<string>();
        const host: MobileShellSideSheetHost & { calls: string[] } = {
            calls,
            isMobileActive: () => true,
            forceCenterColumnFullWidth: () => { calls.push('forceCenterColumnFullWidth'); },
            persistAgentsSurfaceForActiveSession: () => { calls.push('persistAgentsSurfaceForActiveSession'); },
            updateMobileShellStateClasses: () => { calls.push('updateMobileShellStateClasses'); },
            refreshBottomBar: () => { calls.push('refreshBottomBar'); },
            updateBackdropVisibility: () => { calls.push('updateBackdropVisibility'); },
            syncIdeMiniBrowserPreviewSuspension: () => { calls.push('syncIdeMiniBrowserPreviewSuspension'); },
            getBottomPanelPendingUpdate: async () => { calls.push('getBottomPanelPendingUpdate'); },
            prepareSideSheetOpen: async side => { calls.push(`prepareSideSheetOpen:${side}`); },
            mountSideSheetWidget: async (side, widgetId) => { calls.push(`mountSideSheetWidget:${side}:${widgetId}`); },
            ...options.host,
        };
        const shell = {
            isExpanded: (area: string) => expanded.has(area),
            collapsePanel: async (area: string) => { expanded.delete(area); },
            expandPanel: (area: string) => { expanded.add(area); },
            leftPanelHandler: {
                state: { pendingUpdate: Promise.resolve() },
                tabBar: { currentChanged: { connect: () => undefined, disconnect: () => undefined } },
                container: { node: document.createElement('div') },
            },
            rightPanelHandler: {
                state: { pendingUpdate: Promise.resolve() },
                tabBar: { currentChanged: { connect: () => undefined, disconnect: () => undefined } },
                container: { node: document.createElement('div') },
            },
            bottomPanel: {
                hasClass: () => false,
                widgetAdded: { connect: () => undefined, disconnect: () => undefined },
                widgetRemoved: { connect: () => undefined, disconnect: () => undefined },
            },
            onDidChangeActiveWidget: () => ({ dispose: () => undefined }),
            onDidChangeCurrentWidget: () => ({ dispose: () => undefined }),
            onDidAddWidget: () => ({ dispose: () => undefined }),
            onDidRemoveWidget: () => ({ dispose: () => undefined }),
            onDidToggleMaximized: () => ({ dispose: () => undefined }),
            ...(options.shell ?? {}),
        } as unknown as ApplicationShell;

        const bottomBarController = {
            applyMobileBottomPanelMaximizedSize: async () => undefined,
            syncMobileMaximizedOverlayInsets: () => undefined,
            suppressMobileBottomAutoMaximize: false,
            getBottomPanelPendingUpdate: async () => undefined,
        } as unknown as MobileShellBottomBarController;

        const controller = new MobileShellSideSheetController({
            host,
            shell,
            commands: {
                onWillExecuteCommand: () => ({ dispose: () => undefined }),
                onDidExecuteCommand: () => ({ dispose: () => undefined }),
            } as unknown as CommandRegistry,
            bottomBarController,
        });
        return { controller, host, shell };
    }

    it('isSidePanelSheetCollapsedInDom treats collapsed and hidden panels as collapsed', () => {
        const left = document.createElement('div');
        left.id = 'theia-left-content-panel';
        left.classList.add('theia-mod-collapsed');
        document.body.appendChild(left);
        const { controller } = createController();
        expect(controller.isSidePanelSheetCollapsedInDom('left')).to.equal(true);
        left.classList.remove('theia-mod-collapsed');
        left.classList.add('lm-mod-hidden');
        expect(controller.isSidePanelSheetCollapsedInDom('left')).to.equal(true);
    });

    it('isAnyMobileSideSheetVisible requires expanded shell and visible DOM panel', async () => {
        const right = document.createElement('div');
        right.id = 'theia-right-content-panel';
        document.body.appendChild(right);
        const expanded = new Set<string>(['right']);
        const { controller } = createController({
            shell: {
                isExpanded: (area: string) => expanded.has(area),
                collapsePanel: async (area: string) => { expanded.delete(area); },
            } as unknown as ApplicationShell,
        });
        expect(controller.isAnyMobileSideSheetVisible()).to.equal(true);
        await controller.collapseMobileSidePanels();
        expect(controller.isAnyMobileSideSheetVisible()).to.equal(false);
    });

    it('collapseMobileSidePanels collapses expanded panels and updates backdrop', async () => {
        const expanded = new Set<string>(['left', 'right']);
        const { controller, host, shell } = createController({
            shell: {
                isExpanded: (area: string) => expanded.has(area),
                collapsePanel: async (area: string) => { expanded.delete(area); },
            } as unknown as ApplicationShell,
        });
        await controller.collapseMobileSidePanels();
        expect(shell.isExpanded('left')).to.equal(false);
        expect(shell.isExpanded('right')).to.equal(false);
        expect(host.calls).to.include('updateBackdropVisibility');
    });

    it('resetSheetScroll clears virtuoso and perfect-scrollbar containers', () => {
        const container = document.createElement('div');
        const scroller = document.createElement('div');
        scroller.setAttribute('data-virtuoso-scroller', 'true');
        scroller.scrollTop = 120;
        container.appendChild(scroller);
        const { controller } = createController({
            shell: {
                isExpanded: (area: string) => area === 'left',
                leftPanelHandler: {
                    state: { pendingUpdate: Promise.resolve() },
                    tabBar: { currentChanged: { connect: () => undefined, disconnect: () => undefined } },
                    container: { node: container },
                },
            } as unknown as ApplicationShell,
        });
        controller.resetSheetScroll('left');
        expect(scroller.scrollTop).to.equal(0);
    });

    it('scheduleSnapAndUiRefresh runs host refresh pipeline when mobile is active', async () => {
        const { controller, host } = createController();
        controller.scheduleSnapAndUiRefresh();
        await new Promise<void>(resolve => { setTimeout(resolve, 0); });
        expect(host.calls).to.include('persistAgentsSurfaceForActiveSession');
        expect(host.calls).to.include('forceCenterColumnFullWidth');
        expect(host.calls).to.include('refreshBottomBar');
        expect(host.calls).to.include('updateBackdropVisibility');
        expect(host.calls).to.include('syncIdeMiniBrowserPreviewSuspension');
    });

    it('ensureShellHooks wires tab bar changes to scheduleSnapAndUiRefresh', () => {
        let tabChangedHandler: (() => void) | undefined;
        const { controller, host } = createController({
            shell: {
                leftPanelHandler: {
                    state: { pendingUpdate: Promise.resolve() },
                    tabBar: {
                        currentChanged: {
                            connect: (handler: () => void) => { tabChangedHandler = handler; return true; },
                            disconnect: () => true,
                        },
                    },
                    container: { node: document.createElement('div') },
                },
            } as unknown as ApplicationShell,
        });
        const toDispose = new DisposableCollection();
        controller.ensureShellHooks(controller['shell'], toDispose);
        tabChangedHandler?.();
        expect(host.calls).to.include('persistAgentsSurfaceForActiveSession');
    });

});
