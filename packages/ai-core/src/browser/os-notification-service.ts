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
import { nls } from '@theia/core/lib/common/nls';
import { environment } from '@theia/core';

/**
 * Configuration options for OS notifications
 */
export interface OSNotificationOptions {
    /** The notification body text */
    body?: string;
    /** Icon to display with the notification */
    icon?: string;
    /** Whether the notification should be silent */
    silent?: boolean;
    /** Tag to group notifications */
    tag?: string;
    /** Whether the notification requires user interaction to dismiss */
    requireInteraction?: boolean;
    /** Custom data to associate with the notification */
    data?: unknown;
}

/**
 * Result of an OS notification attempt
 */
export interface OSNotificationResult {
    /** Whether the notification was successfully shown */
    success: boolean;
    /** Error message if the notification failed */
    error?: string;
    /** The created notification instance (if successful) */
    notification?: Notification;
}

/**
 * Service to handle OS-level notifications across different platforms
 * Provides fallback mechanisms for environments where notifications are unavailable
 */
@injectable()
export class OSNotificationService {

    private isElectron: boolean;

    constructor() {
        this.isElectron = environment.electron.is();
    }

    /**
     * Show an OS-level notification with the given title and options
     *
     * @param title The notification title
     * @param options Optional notification configuration
     * @returns Promise resolving to the notification result
     */
    async showNotification(title: string, options: OSNotificationOptions = {}): Promise<OSNotificationResult> {
        try {
            if (!this.isNotificationSupported()) {
                return {
                    success: false,
                    error: 'Notifications are not supported in this environment'
                };
            }

            const permission = await this.ensurePermission();
            if (permission !== 'granted') {
                return {
                    success: false,
                    error: `Notification permission ${permission}`
                };
            }

            const notification = await this.createNotification(title, options);
            return {
                success: true,
                notification
            };

        } catch (error) {
            console.error('Failed to show OS notification:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    /**
     * Check if notification permission is granted
     *
     * @returns The current notification permission state
     */
    getPermissionStatus(): NotificationPermission {
        if (!this.isNotificationSupported()) {
            return 'denied';
        }
        return Notification.permission;
    }

    /**
     * Request notification permission from the user
     *
     * @returns Promise resolving to the permission state
     */
    async requestPermission(): Promise<NotificationPermission> {
        if (!this.isNotificationSupported()) {
            return 'denied';
        }

        if (Notification.permission !== 'default') {
            return Notification.permission;
        }

        try {
            const permission = await Notification.requestPermission();
            return permission;
        } catch (error) {
            console.error('Failed to request notification permission:', error);
            return 'denied';
        }
    }

    /**
     * Check if OS notifications are supported in the current environment
     *
     * @returns true if notifications are supported, false otherwise
     */
    isNotificationSupported(): boolean {
        return typeof window !== 'undefined' && 'Notification' in window;
    }

    /**
     * Show a notification specifically for agent completion
     * This is a convenience method with pre-configured options for agent notifications
     *
     * @param agentName The name of the agent that completed
     * @param taskDescription Optional description of the completed task
     * @returns Promise resolving to the notification result
     */
    async showAgentCompletionNotification(agentName: string, taskDescription?: string): Promise<OSNotificationResult> {
        const title = nls.localize('theia/ai-core/agentCompletionTitle', 'Agent "{0}" Task Completed', agentName);
        const body = taskDescription
            ? nls.localize('theia/ai-core/agentCompletionWithTask',
                'Agent "{0}" has completed the task: {1}', agentName, taskDescription)
            : nls.localize('theia/ai-core/agentCompletionMessage',
                'Agent "{0}" has completed its task.', agentName);

        return this.showNotification(title, {
            body,
            icon: this.getAgentCompletionIcon(),
            tag: `agent-completion-${agentName}`,
            requireInteraction: false,
            data: {
                type: 'agent-completion',
                agentName,
                taskDescription,
                timestamp: Date.now()
            }
        });
    }

    /**
     * Ensure notification permission is granted
     *
     * @returns Promise resolving to the permission state
     */
    private async ensurePermission(): Promise<NotificationPermission> {
        const currentPermission = this.getPermissionStatus();

        if (currentPermission === 'granted') {
            return currentPermission;
        }

        if (currentPermission === 'denied') {
            return currentPermission;
        }

        return this.requestPermission();
    }

    /**
     * Create a native notification with the given title and options
     *
     * @param title The notification title
     * @param options The notification options
     * @returns Promise resolving to the created notification
     */
    private async createNotification(title: string, options: OSNotificationOptions): Promise<Notification> {
        return new Promise<Notification>((resolve, reject): void => {
            try {
                const notificationOptions: NotificationOptions = {
                    body: options.body,
                    icon: options.icon,
                    silent: options.silent,
                    tag: options.tag,
                    requireInteraction: options.requireInteraction,
                    data: options.data
                };

                const notification = new Notification(title, notificationOptions);

                notification.onshow = () => {
                    console.debug('OS notification shown:', title);
                };

                notification.onerror = error => {
                    console.error('OS notification error:', error);
                    reject(new Error('Failed to show notification'));
                };

                notification.onclick = () => {
                    console.debug('OS notification clicked:', title);
                    this.focusApplicationWindow();
                    notification.close();
                };

                notification.onclose = () => {
                    console.debug('OS notification closed:', title);
                };

                resolve(notification);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Attempt to focus the application window when notification is clicked
     */
    private focusApplicationWindow(): void {
        try {
            if (typeof window !== 'undefined') {
                window.focus();

                if (this.isElectron && (window as unknown as { electronTheiaCore?: { focusWindow?: () => void } }).electronTheiaCore?.focusWindow) {
                    (window as unknown as { electronTheiaCore: { focusWindow: () => void } }).electronTheiaCore.focusWindow();
                }
            }
        } catch (error) {
            console.debug('Could not focus application window:', error);
        }
    }

    /**
     * Get the icon URL for agent completion notifications
     *
     * @returns The icon URL or undefined if not available
     */
    private getAgentCompletionIcon(): string | undefined {
        // This could return a path to an icon file
        // For now, we'll return undefined to use the default system icon
        return undefined;
    }
}
