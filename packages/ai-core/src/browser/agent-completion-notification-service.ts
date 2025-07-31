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

import { injectable, inject } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/browser/preferences';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { nls } from '@theia/core/lib/common/nls';
import {
    PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
} from './ai-core-preferences';
import { AgentService } from '../common/agent-service';
import { AISettingsService } from '../common/settings-service';
import { OSNotificationService } from './os-notification-service';
import { WindowBlinkService } from './window-blink-service';
import {
    NotificationType,
    NOTIFICATION_TYPE_OFF,
    NOTIFICATION_TYPE_OS_NOTIFICATION,
    NOTIFICATION_TYPE_MESSAGE,
    NOTIFICATION_TYPE_BLINK,
} from '../common/notification-types';

@injectable()
export class AgentCompletionNotificationService {
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(AISettingsService)
    protected readonly settingsService: AISettingsService;

    @inject(OSNotificationService)
    protected readonly osNotificationService: OSNotificationService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WindowBlinkService)
    protected readonly windowBlinkService: WindowBlinkService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    /**
     * Show a completion notification for the specified agent if enabled in preferences.
     *
     * @param agentId The unique identifier of the agent
     * @param taskDescription Optional description of the completed task
     */
    async showCompletionNotification(
        agentId: string,
        taskDescription?: string,
    ): Promise<void> {
        const notificationType =
            await this.getNotificationTypeForAgent(agentId);

        if (notificationType === NOTIFICATION_TYPE_OFF || this.isChatWidgetFocused()) {
            return;
        }

        try {
            const agentName = this.resolveAgentName(agentId);
            await this.executeNotificationType(
                agentName,
                taskDescription,
                notificationType,
            );
        } catch (error) {
            console.error(
                'Failed to show agent completion notification:',
                error,
            );
        }
    }

    /**
     * Resolve the display name for an agent by its ID.
     *
     * @param agentId The unique identifier of the agent
     * @returns The agent's display name or the agent ID if not found
     */
    protected resolveAgentName(agentId: string): string {
        try {
            const agents = this.agentService.getAllAgents();
            const agent = agents.find(a => a.id === agentId);
            return agent?.name || agentId;
        } catch (error) {
            console.warn(
                `Failed to resolve agent name for ID '${agentId}':`,
                error,
            );
            return agentId;
        }
    }

    /**
     * Get the preferred notification type for a specific agent.
     * If no agent-specific preference is set, returns the global default notification type.
     */
    protected async getNotificationTypeForAgent(
        agentId: string,
    ): Promise<NotificationType> {
        const agentSettings =
            await this.settingsService.getAgentSettings(agentId);
        const agentNotificationType = agentSettings?.completionNotification as NotificationType;

        // If agent has no specific setting, use the global default
        if (!agentNotificationType) {
            return this.preferenceService.get<NotificationType>(
                PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
                NOTIFICATION_TYPE_OFF,
            );
        }

        return agentNotificationType;
    }

    /**
     * Execute the specified notification type.
     */
    private async executeNotificationType(
        agentName: string,
        taskDescription: string | undefined,
        type: NotificationType,
    ): Promise<void> {
        switch (type) {
            case NOTIFICATION_TYPE_OS_NOTIFICATION:
                await this.showOSNotification(agentName, taskDescription);
                break;
            case NOTIFICATION_TYPE_MESSAGE:
                await this.showMessageServiceNotification(
                    agentName,
                    taskDescription,
                );
                break;
            case NOTIFICATION_TYPE_BLINK:
                await this.showBlinkNotification(agentName);
                break;
            default:
                throw new Error(`Unknown notification type: ${type}`);
        }
    }

    /**
     * Show OS notification directly.
     */
    protected async showOSNotification(
        agentName: string,
        taskDescription?: string,
    ): Promise<void> {
        const result =
            await this.osNotificationService.showAgentCompletionNotification(
                agentName,
                taskDescription,
            );
        if (!result.success) {
            throw new Error(`OS notification failed: ${result.error}`);
        }
    }

    /**
     * Show MessageService notification.
     */
    protected async showMessageServiceNotification(
        agentName: string,
        taskDescription?: string,
    ): Promise<void> {
        const message = taskDescription
            ? nls.localize(
                'theia/ai-core/agentCompletionWithTask',
                'Agent "{0}" has completed the task: {1}',
                agentName,
                taskDescription,
            )
            : nls.localize(
                'theia/ai-core/agentCompletionMessage',
                'Agent "{0}" has completed its task.',
                agentName,
            );
        this.messageService.info(message);
    }

    /**
     * Show window blink notification.
     */
    protected async showBlinkNotification(agentName: string): Promise<void> {
        const result = await this.windowBlinkService.blinkWindow(agentName);
        if (!result.success) {
            throw new Error(
                `Window blink notification failed: ${result.error}`,
            );
        }
    }

    /**
     * Check if OS notifications are supported and enabled.
     */
    isOSNotificationSupported(): boolean {
        return this.osNotificationService.isNotificationSupported();
    }

    /**
     * Get the current OS notification permission status.
     */
    getOSNotificationPermission(): NotificationPermission {
        return this.osNotificationService.getPermissionStatus();
    }

    /**
     * Request OS notification permission from the user.
     */
    async requestOSNotificationPermission(): Promise<NotificationPermission> {
        return this.osNotificationService.requestPermission();
    }

    /**
     * Check if any chat widget currently has focus.
     */
    protected isChatWidgetFocused(): boolean {
        const activeWidget = this.shell.activeWidget;
        if (!activeWidget) {
            return false;
        }
        return activeWidget.id === 'chat-view-widget';
    }
}
