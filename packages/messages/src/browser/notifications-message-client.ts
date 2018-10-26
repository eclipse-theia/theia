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

import { injectable, inject } from 'inversify';
import {
    MessageClient,
    MessageType,
    Message,
    ProgressMessageArguments,
    ProgressToken,
    ProgressUpdate
} from '@theia/core/lib/common';
import { Notifications, NotificationAction, NotificationProperties, ProgressNotification} from './notifications';
import { NotificationPreferences } from './notification-preferences';

@injectable()
export class NotificationsMessageClient extends MessageClient {

    protected notifications: Notifications = new Notifications();
    @inject(NotificationPreferences) protected preferences: NotificationPreferences;

    showMessage(message: Message): Promise<string | undefined> {
        return this.show(message);
    }

    newProgress(message: ProgressMessageArguments): Promise<ProgressToken | undefined> {
        const messageArguments = { type: MessageType.Progress, text: message.text, options: { timeout: 0 }, actions: message.actions };
        const key = this.getKey(messageArguments);
        if (this.visibleProgressNotifications.has(key)) {
            return Promise.resolve({ id: key });
        }
        const progressNotification = this.notifications.create(this.getNotificationProperties(
            key,
            messageArguments,
            () => {
                const onCancel = message.onCancel;
                if (onCancel) {
                    onCancel(key);
                }
                this.visibleProgressNotifications.delete(key);
            }));
        this.visibleProgressNotifications.set(key, progressNotification);
        progressNotification.show();
        return Promise.resolve({ id: key });
    }

    stopProgress(progress: ProgressToken): Promise<void> {
        const progressMessage = this.visibleProgressNotifications.get(progress.id);
        if (progressMessage) {
            progressMessage.close();
        }
        return Promise.resolve(undefined);
    }

    reportProgress(progress: ProgressToken, update: ProgressUpdate): Promise<void> {
        const notification = this.visibleProgressNotifications.get(progress.id);
        if (notification) {
            notification.update({ message: update.value, increment: update.increment });
        }
        return Promise.resolve(undefined);
    }

    protected visibleMessages = new Set<string>();
    protected visibleProgressNotifications = new Map<string, ProgressNotification>();
    protected show(message: Message): Promise<string | undefined> {
        const key = this.getKey(message);
        if (this.visibleMessages.has(key)) {
            return Promise.resolve(undefined);
        }
        this.visibleMessages.add(key);
        return new Promise(resolve => {
            this.notifications.show(this.getNotificationProperties(key, message, a => {
                this.visibleMessages.delete(key);
                resolve(a);
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

    protected iconFor(type: MessageType): string {
        switch (type) {
            case MessageType.Error: return 'error';
            case MessageType.Warning: return 'warning';
            case MessageType.Progress: return 'progress';
            default: return 'info';
        }
    }
}
