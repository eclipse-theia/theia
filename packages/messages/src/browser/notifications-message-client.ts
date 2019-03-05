/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from 'inversify';
import {
    MessageClient,
    MessageType,
    Message,
    ProgressMessage,
    ProgressUpdate,
    CancellationToken
} from '@theia/core/lib/common';
import { Notifications, NotificationAction, NotificationProperties, ProgressNotification } from './notifications';
import { NotificationPreferences } from './notification-preferences';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { StatusBarAlignment } from '@theia/core/lib/browser';

@injectable()
export class NotificationsMessageClient extends MessageClient {

    protected notifications: Notifications = new Notifications();
    @inject(NotificationPreferences) protected preferences: NotificationPreferences;

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    protected notificationToastsVisibleKey: ContextKey<boolean>;

    @inject(StatusBar) protected readonly statusBar: StatusBar;

    @postConstruct()
    protected init(): void {
        this.notificationToastsVisibleKey = this.contextKeyService.createKey<boolean>('notificationToastsVisible', false);
    }

    showMessage(message: Message): Promise<string | undefined> {
        return this.show(message);
    }

    showProgress(progressId: string, message: ProgressMessage, cancellationToken: CancellationToken, update?: ProgressUpdate): Promise<string | undefined> {
        const messageArguments = {
            ...message,
            type: MessageType.Progress,
            options: {...(message.options || {})}
        };
        if (this.activeProgressNotifications.has(progressId)) {
            throw new Error('Cannot show new progress with already existing id.');
        }
        return new Promise(resolve => {
            let progressNotification: ProgressNotification;

            const updateStatusBarEntry = () => {
                const elementId = 'status-bar-progress';
                const activeProgressQuantity = this.activeProgressNotifications.size;
                if (!activeProgressQuantity) {
                    this.statusBar.removeElement(elementId);
                    return;
                }
                this.statusBar.setElement(elementId, {
                    text: `$(spinner~spin) Tasks in Progress: ${activeProgressQuantity}`,
                    tooltip: 'Click to show all notifications',
                    alignment: StatusBarAlignment.LEFT,
                    priority: 0,
                    onclick: () => {
                        this.activeProgressNotifications.forEach(notification => notification.show());
                    }
                });
            };
            const notificationProperties = this.getNotificationProperties(progressId, messageArguments, action => {
                resolve(action);
                if (this.activeProgressNotifications.has(progressId)) {
                    notificationProperties.timeout = undefined;
                    progressNotification = this.notifications.create(notificationProperties);
                    this.activeProgressNotifications.set(progressId, progressNotification);
                    updateStatusBarEntry();
                    if (!update) {
                        return;
                    }
                    progressNotification.update(update);
                }
            });
            progressNotification = this.notifications.create(notificationProperties);
            this.activeProgressNotifications.set(progressId, progressNotification);
            if (this.activeProgressNotifications.size > 1) {
                updateStatusBarEntry();
            }
            progressNotification.show();
            if (update) {
                progressNotification.update(update);
            }
            const cancel = () => {
                this.activeProgressNotifications.delete(progressId);
                updateStatusBarEntry();
                if (message.options && message.options.cancelable) {
                    resolve(ProgressMessage.Cancel);
                }
                progressNotification.close();
            };
            if (cancellationToken.isCancellationRequested) {
                cancel();
            } else {
                cancellationToken.onCancellationRequested(cancel);
            }
        });
    }

    async reportProgress(progressId: string, update: ProgressUpdate, message: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        const notification = this.activeProgressNotifications.get(progressId);
        if (notification) {
            notification.update(update);
        } else {
            this.showProgress(progressId, message, cancellationToken, update);
        }
    }

    protected visibleMessages = new Set<string>();
    protected activeProgressNotifications = new Map<string, ProgressNotification>();
    protected show(message: Message): Promise<string | undefined> {
        const key = this.getKey(message);
        if (this.visibleMessages.has(key)) {
            return Promise.resolve(undefined);
        }
        this.visibleMessages.add(key);
        return new Promise(resolve => {
            this.notificationToastsVisibleKey.set(true);
            this.notifications.show(this.getNotificationProperties(key, message, action => {
                this.notificationToastsVisibleKey.set(false);
                this.visibleMessages.delete(key);
                resolve(action);
            }));
        });
    }

    protected getKey(m: Message): string {
        return `${m.type}-${m.text}-${m.actions ? m.actions.join('|') : '|'}`;
    }

    protected getNotificationProperties(id: string, message: Message, onCloseFn: (action: string | undefined) => void): NotificationProperties {
        const icon = this.iconFor(message.type);
        const text = message.text;
        const actions = (message.actions || []).map(action => <NotificationAction>{
            label: action,
            fn: element => onCloseFn(action)
        });

        const timeout = actions.length > 0 ? undefined
            : (!!message.options && message.options.timeout !== undefined
                ? message.options.timeout
                : this.preferences['notification.timeout']);

        actions.push(<NotificationAction>{
            label: 'Close',
            fn: element => onCloseFn(undefined)
        });
        return {
            id,
            icon,
            text,
            actions,
            timeout,
            onTimeout: () => onCloseFn(undefined)
        };
    }

    protected iconFor(type: MessageType | undefined): string {
        switch (type) {
            case MessageType.Error: return 'error';
            case MessageType.Warning: return 'warning';
            case MessageType.Progress: return 'progress';
            default: return 'info';
        }
    }
}
