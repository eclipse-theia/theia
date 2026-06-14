// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { MobileHaptics } from './mobile-haptics';
import { MobileKeyboardHelper } from './mobile-keyboard-helper';

export interface MobileShellOverlayHost {
    isMobileActive(): boolean;
    isWorkspaceOpened(): boolean;
    toggleProjectsPanel(): Promise<void>;
    isAnyMobileSideSheetVisible(): boolean;
    requestSheetRelayout(): void;
    relayoutMobileSidePanelHandler(side: 'left' | 'right'): void;
}

export interface MobileShellOverlayHostOptions {
    host: MobileShellOverlayHost;
    shell: ApplicationShell;
}

/** Edge swipe zones, keyboard inset helper, and side-sheet backdrop lifecycle. */
export class MobileShellOverlayHostController {

    protected leftEdge: HTMLElement | undefined;
    protected rightEdge: HTMLElement | undefined;
    protected keyboardHelper: MobileKeyboardHelper | undefined;
    protected leftEdgeTouchStartX = 0;
    protected rightEdgeTouchStartX = 0;

    protected readonly host: MobileShellOverlayHost;
    protected readonly shell: ApplicationShell;

    constructor(options: MobileShellOverlayHostOptions) {
        this.host = options.host;
        this.shell = options.shell;
    }

    /** Mount edge swipe zones and keyboard inset tracking when mobile layout is active. */
    ensureMounted(): void {
        if (!this.leftEdge) {
            this.leftEdge = document.createElement('div');
            this.leftEdge.className = 'theia-mobile-edgeSwipeZone theia-mobile-edgeSwipeZone-left';
            this.leftEdge.addEventListener('touchstart', this.onLeftEdgeTouchStart, { passive: true });
            this.leftEdge.addEventListener('touchend', this.onLeftEdgeTouchEnd, { passive: true });
            document.body.appendChild(this.leftEdge);
        }
        if (!this.rightEdge) {
            this.rightEdge = document.createElement('div');
            this.rightEdge.className = 'theia-mobile-edgeSwipeZone theia-mobile-edgeSwipeZone-right';
            this.rightEdge.addEventListener('touchstart', this.onRightEdgeTouchStart, { passive: true });
            this.rightEdge.addEventListener('touchend', this.onRightEdgeTouchEnd, { passive: true });
            document.body.appendChild(this.rightEdge);
        }
        if (!this.keyboardHelper) {
            this.keyboardHelper = new MobileKeyboardHelper(this.shell.node);
            this.keyboardHelper.install();
        }
    }

    teardown(): void {
        if (this.leftEdge?.parentElement) {
            this.leftEdge.removeEventListener('touchstart', this.onLeftEdgeTouchStart);
            this.leftEdge.removeEventListener('touchend', this.onLeftEdgeTouchEnd);
            this.leftEdge.parentElement.removeChild(this.leftEdge);
        }
        this.leftEdge = undefined;
        if (this.rightEdge?.parentElement) {
            this.rightEdge.removeEventListener('touchstart', this.onRightEdgeTouchStart);
            this.rightEdge.removeEventListener('touchend', this.onRightEdgeTouchEnd);
            this.rightEdge.parentElement.removeChild(this.rightEdge);
        }
        this.rightEdge = undefined;
        this.keyboardHelper?.dispose();
        this.keyboardHelper = undefined;
    }

    removeBackdrop(): void {
        document.querySelector('.theia-mobile-sheet-backdrop')?.remove();
    }

    updateBackdropVisibility(): void {
        /* No interactive backdrop — it sat above the shell and closed sheets on the first in-panel touch. */
        this.removeBackdrop();
        if (!this.host.isAnyMobileSideSheetVisible()) {
            return;
        }
        window.requestAnimationFrame(() => {
            this.host.requestSheetRelayout();
            if (this.shell.isExpanded('left')) {
                this.host.relayoutMobileSidePanelHandler('left');
            }
            if (this.shell.isExpanded('right')) {
                this.host.relayoutMobileSidePanelHandler('right');
            }
        });
    }

    protected readonly onLeftEdgeTouchStart = (e: TouchEvent): void => {
        this.leftEdgeTouchStartX = e.changedTouches[0]?.clientX ?? 0;
    };

    protected readonly onLeftEdgeTouchEnd = (e: TouchEvent): void => {
        const x = e.changedTouches[0]?.clientX ?? 0;
        if (x - this.leftEdgeTouchStartX <= 40) {
            return;
        }
        MobileHaptics.fire(MobileHaptics.MEDIUM);
        if (this.host.isMobileActive() && this.host.isWorkspaceOpened()) {
            void this.host.toggleProjectsPanel();
            return;
        }
        void this.shell.leftPanelHandler.expand();
    };

    protected readonly onRightEdgeTouchStart = (e: TouchEvent): void => {
        this.rightEdgeTouchStartX = e.changedTouches[0]?.clientX ?? 0;
    };

    protected readonly onRightEdgeTouchEnd = (e: TouchEvent): void => {
        const x = e.changedTouches[0]?.clientX ?? 0;
        if (this.rightEdgeTouchStartX - x > 40) {
            MobileHaptics.fire(MobileHaptics.MEDIUM);
            void this.shell.rightPanelHandler.expand();
        }
    };

}
