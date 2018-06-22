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
    Message
} from '@theia/core/lib/common';
import { Notifications, NotificationAction } from './notifications';
import { NotificationPreferences } from "./notification-preferences";

@injectable()
export class NotificationsMessageClient extends MessageClient {

    protected notifications: Notifications = new Notifications();
    @inject(NotificationPreferences) protected preferences: NotificationPreferences;

    showMessage(message: Message): Promise<string | undefined> {
        return this.show(message);
    }

    protected show(message: Message): Promise<string | undefined> {
        return new Promise(resolve => {
            this.showToast(message, a => resolve(a));
        });
    }

    protected showToast(message: Message, onCloseFn: (action: string | undefined) => void): void {
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
        this.notifications.show({
            icon,
            text,
            actions,
            timeout
        });
    }

    protected iconFor(type: MessageType): string {
        if (type === MessageType.Error) {
            return 'error';
        }
        if (type === MessageType.Warning) {
            return 'warning';
        }
        return 'info';
    }
}
