/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { MessageClient, messageServicePath } from '@theia/core/lib/common';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';

import { NotificationsMessageClient } from './notifications-message-client';

import '../../src/browser/style/index.css';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(NotificationsMessageClient).toSelf().inSingletonScope();
    rebind(MessageClient).toDynamicValue(context => {
        const notificationsClient = context.container.get(NotificationsMessageClient);
        // connect to remote interface
        WebSocketConnectionProvider.createProxy(context.container, messageServicePath, notificationsClient);
        return notificationsClient;
    }).inSingletonScope();
});
