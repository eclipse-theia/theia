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

import { injectable } from '@theia/core/shared/inversify';
import { environment } from '@theia/core';

/**
 * Result of a window blink attempt
 */
export interface WindowBlinkResult {
    /** Whether the window blink was successful */
    success: boolean;
    /** Error message if the blink failed */
    error?: string;
}

/**
 * Service for blinking/flashing the application window to get user attention.
 */
@injectable()
export class WindowBlinkService {

    private isElectron: boolean;

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

        if (document.hidden) {
            try {
                const theiaCoreAPI = (window as unknown as { electronTheiaCore?: { focusWindow?: () => void } }).electronTheiaCore;
                if (theiaCoreAPI?.focusWindow) {
                    theiaCoreAPI.focusWindow();
                } else {
                    window.focus();
                }
            } catch (error) {
                console.debug('Could not focus hidden window:', error);
            }
        }
    }

    private async blinkBrowserWindow(agentName?: string): Promise<void> {
        await this.blinkDocumentTitle(agentName);
        this.blinkWithVisibilityAPI();
        if (document.hidden) {
            this.focusWindow();
        }
    }

    private async blinkDocumentTitle(agentName?: string): Promise<void> {
        const originalTitle = document.title;
        const alertTitle = agentName
            ? `🔔 Theia - Agent "${agentName}" Completed`
            : '🔔 Theia - Agent Completed';

        let blinkCount = 0;
        const maxBlinks = 6;

        const blinkInterval = setInterval(() => {
            if (blinkCount >= maxBlinks) {
                clearInterval(blinkInterval);
                document.title = originalTitle;
                return;
            }

            document.title = blinkCount % 2 === 0 ? alertTitle : originalTitle;
            blinkCount++;
        }, 500);
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

    /**
     * Check if window blinking is supported in the current environment.
     */
    isBlinkSupported(): boolean {
        if (this.isElectron) {
            const theiaCoreAPI = (window as unknown as { electronTheiaCore?: { focusWindow?: () => void } }).electronTheiaCore;
            return !!(theiaCoreAPI?.focusWindow);
        }

        // In browser, we can always provide some form of attention-getting behavior
        return true;
    }

    /**
     * Get information about the blinking capabilities.
     */
    getBlinkCapabilities(): {
        supported: boolean;
        method: 'electron' | 'browser' | 'none';
        features: string[];
    } {
        const features: string[] = [];
        let method: 'electron' | 'browser' | 'none' = 'none';

        if (this.isElectron) {
            method = 'electron';
            const theiaCoreAPI = (window as unknown as { electronTheiaCore?: { focusWindow?: () => void } }).electronTheiaCore;

            if (theiaCoreAPI?.focusWindow) {
                features.push('electronTheiaCore.focusWindow');
                features.push('document.title blinking');
                features.push('window.focus');
            }
        } else {
            method = 'browser';
            features.push('document.title');
            features.push('window.focus');

            if (typeof document.hidden !== 'undefined') {
                features.push('Page Visibility API');
            }
        }

        return {
            supported: features.length > 0,
            method,
            features
        };
    }
}
