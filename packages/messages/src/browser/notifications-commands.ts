/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { Command } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';

export namespace NotificationsCommands {

    const NOTIFICATIONS_CATEGORY_KEY = 'vscode/notificationsCommands/notifications';
    const NOTIFICATIONS_CATEGORY = 'Notifications';

    export const TOGGLE = Command.toLocalizedCommand({
        id: 'notifications.commands.toggle',
        category: NOTIFICATIONS_CATEGORY,
        iconClass: codicon('list-unordered'),
        label: 'Toggle Notifications'
    }, 'theia/messages/toggleNotifications', NOTIFICATIONS_CATEGORY_KEY);

    export const SHOW = Command.toLocalizedCommand({
        id: 'notifications.commands.show',
        category: NOTIFICATIONS_CATEGORY,
        label: 'Show Notifications'
    }, 'vscode/notificationsCommands/showNotifications', NOTIFICATIONS_CATEGORY_KEY);

    export const HIDE = Command.toLocalizedCommand({
        id: 'notifications.commands.hide',
        category: NOTIFICATIONS_CATEGORY,
        label: 'Hide Notifications'
    }, 'vscode/notificationsCommands/hideNotifications', NOTIFICATIONS_CATEGORY_KEY);

    export const CLEAR_ALL = Command.toLocalizedCommand({
        id: 'notifications.commands.clearAll',
        category: NOTIFICATIONS_CATEGORY,
        iconClass: codicon('clear-all'),
        label: 'Clear All Notifications'
    }, 'vscode/notificationsCommands/clearAllNotifications', NOTIFICATIONS_CATEGORY_KEY);
}
