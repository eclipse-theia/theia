/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler, MessageClient, DispatchingMessageClient, messageServicePath } from '@theia/core/lib/common';

export default new ContainerModule((bind, unbind, isBound, rebind) => {

    bind(DispatchingMessageClient).toSelf().inSingletonScope();
    rebind(MessageClient).toDynamicValue(ctx => ctx.container.get(DispatchingMessageClient)).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<MessageClient>(messageServicePath, client => {
            const dispatching = ctx.container.get<DispatchingMessageClient>(DispatchingMessageClient);
            dispatching.clients.add(client);
            client.onDidCloseConnection(() => dispatching.clients.delete(client));
            return dispatching;
        })
    ).inSingletonScope();
});
