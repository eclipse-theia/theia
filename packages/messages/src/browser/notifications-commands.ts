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

export namespace NotificationsCommands {

    const NOTIFICATIONS_CATEGORY = 'Notifications';

    export const TOGGLE: Command = {
        id: 'notifications.commands.toggle',
        category: NOTIFICATIONS_CATEGORY,
        iconClass: 'fa fa-th-list',
        label: 'Toggle Notifications'
    };

    export const HIDE: Command = {
        id: 'notifications.commands.hide',
    };

    export const CLEAR_ALL: Command = {
        id: 'notifications.commands.clearAll',
        category: NOTIFICATIONS_CATEGORY,
        iconClass: 'fa fa-times-circle',
        label: 'Clear All Notifications'
    };
}
