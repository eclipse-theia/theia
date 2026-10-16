// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import {
    PREFERENCE_NAME_DEFAULT_NOTIFICATION_TYPE,
} from '../common/ai-core-preferences';
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
    AgentNotificationKind,
    AGENT_NOTIFICATION_KIND_INPUT_NEEDED,
} from '../common/notification-types';
import { PreferenceService, ILogger } from '@theia/core';

/**
 * Options for showing an agent notification.
 */
export interface AgentNotificationOptions {
    /**
     * Callback to check if the notification should be suppressed.
     * If returns true, the notification will not be shown.
     */
    shouldSuppress?: () => boolean;
    /**
     * Callback to invoke when the notification is clicked/activated.
     * Used for navigating to the relevant chat session.
     */
    onActivate?: () => void;
    /**
     * Title of the chat session for display in the notification.
     * Helps distinguish between multiple chats with the same agent.
     */
    sessionTitle?: string;
}

@injectable()
export class AgentNotificationService {
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

    @inject(ILogger) @named('ai-core:AgentNotificationService')
    protected readonly logger: ILogger;

    /**
     * Show a notification for the specified agent if enabled in preferences.
     *
     * @param agentId The unique identifier of the agent
     * @param kind Whether the agent completed its task or needs user input
     * @param options Optional configuration for the notification
     */
    async showNotification(
        agentId: string,
        kind: AgentNotificationKind,
        options?: AgentNotificationOptions,
    ): Promise<void> {
        const notificationType =
            await this.getNotificationTypeForAgent(agentId);

        if (notificationType === NOTIFICATION_TYPE_OFF) {
            return;
        }

        // Check if notification should be suppressed (e.g., user is viewing the same session)
        if (options?.shouldSuppress?.()) {
            return;
        }

        try {
            const agentName = this.resolveAgentName(agentId);
            await this.executeNotificationType(
                agentName,
                kind,
                notificationType,
                options?.onActivate,
                options?.sessionTitle,
            );
        } catch (error) {
            this.logger.error(
                'Failed to show agent notification:',
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
            this.logger.warn(
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
                { fallback: NOTIFICATION_TYPE_OFF },
            );
        }

        return agentNotificationType;
    }

    /**
     * Execute the specified notification type.
     */
    private async executeNotificationType(
        agentName: string,
        kind: AgentNotificationKind,
        type: NotificationType,
        onActivate?: () => void,
        sessionTitle?: string,
    ): Promise<void> {
        switch (type) {
            case NOTIFICATION_TYPE_OS_NOTIFICATION:
                await this.showOSNotification(agentName, kind, onActivate, sessionTitle);
                break;
            case NOTIFICATION_TYPE_MESSAGE:
                await this.showMessageServiceNotification(agentName, kind, onActivate, sessionTitle);
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
        kind: AgentNotificationKind,
        onActivate?: () => void,
        sessionTitle?: string,
    ): Promise<void> {
        const result =
            await this.osNotificationService.showAgentNotification(
                agentName,
                kind,
                sessionTitle,
                onActivate,
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
        kind: AgentNotificationKind,
        onActivate?: () => void,
        sessionTitle?: string,
    ): Promise<void> {
        const message = kind === AGENT_NOTIFICATION_KIND_INPUT_NEEDED
            ? (sessionTitle
                ? nls.localize(
                    'theia/ai-core/agentInputNeededMessageWithSession',
                    'Agent "{0}" needs your input in "{1}".',
                    agentName,
                    sessionTitle,
                )
                : nls.localize(
                    'theia/ai-core/agentInputNeededMessage',
                    'Agent "{0}" needs your input.',
                    agentName,
                ))
            : (sessionTitle
                ? nls.localize(
                    'theia/ai-core/agentCompletionMessageWithSession',
                    'Agent "{0}" has completed its task in "{1}".',
                    agentName,
                    sessionTitle,
                )
                : nls.localize(
                    'theia/ai-core/agentCompletionMessage',
                    'Agent "{0}" has completed its task.',
                    agentName,
                ));
        const showChatAction = nls.localize('theia/ai-core/showChat', 'Show Chat');
        const action = await this.messageService.info(message, showChatAction);
        if (action === showChatAction && onActivate) {
            onActivate();
        }
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
}
