// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { environment, nls } from '@theia/core';
import { WindowTitleService } from '@theia/core/lib/browser/window/window-title-service';
import { SecondaryWindowService } from '@theia/core/lib/browser/window/secondary-window-service';

/**
 * Result of a window blink attempt
 */
export interface WindowBlinkResult {
    /** Whether the window blink was successful */
    success: boolean;
    /** Error message if the blink failed */
    error?: string;
}

/** Element ID used for the custom titlebar in Electron. Matches the ID set in electron-menu-contribution.ts. */
const CUSTOM_TITLE_ELEMENT_ID = 'theia-custom-title';

/**
 * Service for blinking/flashing the application window to get user attention.
 */
@injectable()
export class WindowBlinkService {

    @inject(WindowTitleService) @optional()
    protected readonly windowTitleService?: WindowTitleService;

    @inject(SecondaryWindowService) @optional()
    protected readonly secondaryWindowService?: SecondaryWindowService;

    private isElectron: boolean;
    private activeBlinkInterval?: ReturnType<typeof setInterval>;
    private originalSecondaryTitles: Map<Window, string> = new Map();

    constructor() {
        this.isElectron = environment.electron.is();
    }

    /**
     * Blink/flash the window to get user attention.
     * The implementation varies depending on the platform and environment.
     *
     * @param agentName Optional name of the agent to include in the blink notification
     */
    async blinkWindow(agentName?: string): Promise<WindowBlinkResult> {
        try {
            if (this.isElectron) {
                await this.blinkElectronWindow(agentName);
            } else {
                await this.blinkBrowserWindow(agentName);
            }
            return { success: true };
        } catch (error) {
            console.warn('Failed to blink window:', error);
            try {
                if (document.hidden) {
                    this.focusWindow();
                }
                return { success: true };
            } catch (fallbackError) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to blink window'
                };
            }
        }
    }

    private async blinkElectronWindow(agentName?: string): Promise<void> {
        await this.blinkDocumentTitle(agentName);
    }

    private async blinkBrowserWindow(agentName?: string): Promise<void> {
        await this.blinkDocumentTitle(agentName);
        this.blinkWithVisibilityAPI();
        if (document.hidden) {
            this.focusWindow();
        }
    }

    private async blinkDocumentTitle(agentName?: string): Promise<void> {
        // Clear any existing blink interval to prevent concurrent title animations
        if (this.activeBlinkInterval) {
            clearInterval(this.activeBlinkInterval);
            this.activeBlinkInterval = undefined;
        }

        const originalTitle = this.windowTitleService?.title ?? document.title;
        const alertTitle = '🔔 ' + (agentName
            ? nls.localize('theia/ai/core/blinkTitle/namedAgentCompleted', 'Theia - Agent "{0}" Completed', agentName)
            : nls.localize('theia/ai/core/blinkTitle/agentCompleted', 'Theia - Agent Completed'));

        // Save original titles of secondary windows
        this.originalSecondaryTitles.clear();
        const secondaryWindows = this.secondaryWindowService?.getWindows() ?? [];
        for (const win of secondaryWindows) {
            if (!win.closed) {
                this.originalSecondaryTitles.set(win, win.document.title);
            }
        }

        let blinkCount = 0;
        const maxBlinks = 6;

        this.activeBlinkInterval = setInterval(() => {
            if (blinkCount >= maxBlinks) {
                clearInterval(this.activeBlinkInterval);
                this.activeBlinkInterval = undefined;
                this.setTitle(originalTitle);
                this.restoreSecondaryWindowTitles();
                return;
            }

            const title = blinkCount % 2 === 0 ? alertTitle : originalTitle;
            this.setTitle(title);
            this.setSecondaryWindowTitles(blinkCount % 2 === 0 ? alertTitle : undefined);
            blinkCount++;
        }, 500);
    }

    /**
     * Set the window title directly on document.title and the custom titlebar element.
     * This bypasses WindowTitleService to avoid corrupting the title template state.
     */
    private setTitle(title: string): void {
        document.title = title;
        // Also update the custom titlebar element directly if it exists
        const customTitleElement = document.getElementById(CUSTOM_TITLE_ELEMENT_ID);
        if (customTitleElement) {
            customTitleElement.textContent = title;
        }
    }

    /**
     * Set the alert title on all secondary windows, or restore their original titles.
     */
    private setSecondaryWindowTitles(alertTitle: string | undefined): void {
        for (const [win, originalTitle] of this.originalSecondaryTitles) {
            if (!win.closed) {
                win.document.title = alertTitle ?? originalTitle;
            }
        }
    }

    /**
     * Restore original titles on all secondary windows.
     */
    private restoreSecondaryWindowTitles(): void {
        for (const [win, originalTitle] of this.originalSecondaryTitles) {
            if (!win.closed) {
                win.document.title = originalTitle;
            }
        }
        this.originalSecondaryTitles.clear();
    }

    private blinkWithVisibilityAPI(): void {
        // This method provides visual attention-getting behavior without creating notifications
        // as notifications are handled by the OSNotificationService to avoid duplicates
        if (!this.isElectron && typeof document.hidden !== 'undefined') {
            // Focus the window if it's hidden to get user attention
            if (document.hidden) {
                this.focusWindow();
            }
        }
    }

    private focusWindow(): void {
        try {
            window.focus();

            // Try to scroll to top to create some visual movement
            if (document.body.scrollTop > 0 || document.documentElement.scrollTop > 0) {
                const currentScroll = document.documentElement.scrollTop || document.body.scrollTop;
                window.scrollTo(0, 0);
                setTimeout(() => {
                    window.scrollTo(0, currentScroll);
                }, 100);
            }
        } catch (error) {
            console.debug('Could not focus window:', error);
        }
    }

}
