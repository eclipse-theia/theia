// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import type { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import type {
    MobileShellOverlayHost,
    MobileShellOverlayHostController as MobileShellOverlayHostControllerType,
} from './mobile-shell-overlay-host';

describe('mobile-shell-overlay-host', () => {

    let MobileShellOverlayHostController: typeof MobileShellOverlayHostControllerType;
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
        (global as unknown as { window: Window }).window.requestAnimationFrame = raf;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellOverlayHostController = require('./mobile-shell-overlay-host').MobileShellOverlayHostController;
    });

    function createController(options: {
        host?: Partial<MobileShellOverlayHost>;
        shell?: Partial<ApplicationShell>;
    } = {}): {
        controller: MobileShellOverlayHostControllerType;
        host: MobileShellOverlayHost & { calls: string[] };
    } {
        const calls: string[] = [];
        const host: MobileShellOverlayHost & { calls: string[] } = {
            calls,
            isMobileActive: () => true,
            isWorkspaceOpened: () => true,
            toggleProjectsPanel: async () => { calls.push('toggleProjectsPanel'); },
            isAnyMobileSideSheetVisible: () => false,
            requestSheetRelayout: () => { calls.push('requestSheetRelayout'); },
            relayoutMobileSidePanelHandler: side => { calls.push(`relayout:${side}`); },
            ...options.host,
        };
        const shell = {
            node: document.createElement('div'),
            isExpanded: () => false,
            leftPanelHandler: { expand: async () => undefined },
            rightPanelHandler: { expand: async () => undefined },
            ...options.shell,
        } as ApplicationShell;
        const controller = new MobileShellOverlayHostController({ host, shell });
        return { controller, host };
    }

    it('removeBackdrop removes stale sheet backdrop nodes', () => {
        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sheet-backdrop';
        document.body.appendChild(backdrop);
        const { controller } = createController();
        controller.removeBackdrop();
        expect(document.querySelector('.theia-mobile-sheet-backdrop')).to.equal(null);
    });

    it('ensureMounted creates edge swipe zones and keyboard helper', () => {
        const { controller } = createController();
        controller.ensureMounted();
        expect(document.querySelector('.theia-mobile-edgeSwipeZone-left')).to.not.equal(null);
        expect(document.querySelector('.theia-mobile-edgeSwipeZone-right')).to.not.equal(null);
    });

    it('teardown removes edge swipe zones', () => {
        const { controller } = createController();
        controller.ensureMounted();
        controller.teardown();
        expect(document.querySelector('.theia-mobile-edgeSwipeZone-left')).to.equal(null);
        expect(document.querySelector('.theia-mobile-edgeSwipeZone-right')).to.equal(null);
    });

    it('updateBackdropVisibility relayouts when a side sheet is visible', () => {
        const { controller, host } = createController({
            host: {
                isAnyMobileSideSheetVisible: () => true,
            },
            shell: {
                isExpanded: (side: string) => side === 'left',
            },
        });
        controller.updateBackdropVisibility();
        expect(host.calls).to.include('requestSheetRelayout');
        expect(host.calls).to.include('relayout:left');
    });

    it('left edge swipe opens projects when mobile workspace is active', () => {
        const { controller, host } = createController();
        controller.ensureMounted();
        const leftEdge = document.querySelector('.theia-mobile-edgeSwipeZone-left') as HTMLElement;
        leftEdge.dispatchEvent(new TouchEvent('touchstart', {
            changedTouches: [{ clientX: 10 } as Touch],
        }));
        leftEdge.dispatchEvent(new TouchEvent('touchend', {
            changedTouches: [{ clientX: 80 } as Touch],
        }));
        expect(host.calls).to.include('toggleProjectsPanel');
    });

});
