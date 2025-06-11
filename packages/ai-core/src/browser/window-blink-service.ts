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
        this.isElectron = this.detectElectronEnvironment();
    }

    /**
     * Blink/flash the window to get user attention.
     * The implementation varies depending on the platform and environment.
     */
    async blinkWindow(): Promise<WindowBlinkResult> {
        try {
            if (this.isElectron) {
                await this.blinkElectronWindow();
            } else {
                await this.blinkBrowserWindow();
            }
            return { success: true };
        } catch (error) {
            console.warn('Failed to blink window:', error);
            try {
                this.focusWindow();
                return { success: true };
            } catch (fallbackError) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to blink window'
                };
            }
        }
    }

    /**
     * Blink the window in Electron environment.
     */
    private async blinkElectronWindow(): Promise<void> {
        const electronAPI = (window as unknown as { electronAPI?: { flashWindow?: () => void } }).electronAPI;
        if (electronAPI?.flashWindow) {
            electronAPI.flashWindow();
            return;
        }

        // Fallback: Try to access remote electron API
        const electron = (window as unknown as { electron?: { remote?: { getCurrentWindow: () => { flashFrame: (flag: boolean) => void } } } }).electron;
        if (electron?.remote?.getCurrentWindow) {
            const currentWindow = electron.remote.getCurrentWindow();
            if (currentWindow.flashFrame) {
                currentWindow.flashFrame(true);
                // Turn off the flashing after a short delay
                setTimeout(() => {
                    try {
                        currentWindow.flashFrame(false);
                    } catch (e) {
                        // Ignore errors when turning off flash
                    }
                }, 1000);
                return;
            }
        }

        await this.blinkBrowserWindow();
    }

    /**
     * Blink the window in browser environment using various techniques.
     */
    private async blinkBrowserWindow(): Promise<void> {
        // Technique 1: Rapidly change document title to create a blinking effect
        await this.blinkDocumentTitle();

        // Technique 2: Try to flash the window using the focus API
        this.focusWindow();

        // Technique 3: If supported, use the Page Visibility API to create attention
        this.blinkWithVisibilityAPI();
    }

    /**
     * Blink the document title to get user attention.
     */
    private async blinkDocumentTitle(): Promise<void> {
        const originalTitle = document.title;
        const alertTitle = '🔔 Theia - Agent Completed';

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

    /**
     * Try to get user attention using the Page Visibility API.
     */
    private blinkWithVisibilityAPI(): void {
        // If the page is hidden, try to trigger visibility change events
        if (document.hidden) {
            window.focus();
        }

        // Try to trigger a notification-like behavior
        if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('Agent Completed', {
                body: 'An AI agent has finished its task.',
                icon: '/favicon.ico',
                tag: 'agent-completion',
                requireInteraction: false
            });

            setTimeout(() => {
                notification.close();
            }, 100);
        }
    }

    /**
     * Focus the window - basic fallback method.
     */
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
     * Detect if running in Electron environment.
     */
    private detectElectronEnvironment(): boolean {
        // Use Theia's environment detection first
        if (environment.electron.is()) {
            return true;
        }

        // Additional detection methods as fallback
        return !!(
            (window as unknown as { electronAPI?: unknown }).electronAPI ||
            (window as unknown as { electron?: unknown }).electron ||
            (window as unknown as { process?: { type?: string } }).process?.type ||
            (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron'))
        );
    }

    /**
     * Check if window blinking is supported in the current environment.
     */
    isBlinkSupported(): boolean {
        if (this.isElectron) {
            // Check if Electron window flashing is available
            const electronAPI = (window as unknown as { electronAPI?: { flashWindow?: () => void } }).electronAPI;
            const electron = (window as unknown as { electron?: { remote?: { getCurrentWindow: () => unknown } } }).electron;

            return !!(
                electronAPI?.flashWindow ||
                electron?.remote?.getCurrentWindow
            );
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
            const electronAPI = (window as unknown as { electronAPI?: { flashWindow?: () => void } }).electronAPI;
            const electron = (window as unknown as { electron?: { remote?: { getCurrentWindow: () => unknown } } }).electron;

            if (electronAPI?.flashWindow) {
                features.push('electronAPI.flashWindow');
            }
            if (electron?.remote?.getCurrentWindow) {
                features.push('electron.remote.flashFrame');
            }
        } else {
            method = 'browser';
            features.push('document.title');
            features.push('window.focus');

            if ('Notification' in window) {
                features.push('Notification API');
            }
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
