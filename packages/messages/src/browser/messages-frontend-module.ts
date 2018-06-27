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

import { ContainerModule } from 'inversify';
import { MessageClient, messageServicePath } from '@theia/core/lib/common';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';

import { NotificationsMessageClient } from './notifications-message-client';

import '../../src/browser/style/index.css';
import { bindNotificationPreferences } from './notification-preferences';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindNotificationPreferences(bind);
    bind(NotificationsMessageClient).toSelf().inSingletonScope();
    rebind(MessageClient).toDynamicValue(context => {
        const notificationsClient = context.container.get(NotificationsMessageClient);
        // connect to remote interface
        WebSocketConnectionProvider.createProxy(context.container, messageServicePath, notificationsClient);
        return notificationsClient;
    }).inSingletonScope();
});
