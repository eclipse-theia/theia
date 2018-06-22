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
