/********************************************************************************
 * Copyright (C) 2019 Progyan Bhattacharya
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
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { servicePath, IBroadcastClientDispatch, BroadcastClientDispatch, IBroadcastClient, IBroadcastServer, BroadcastServer, BroadcastWatcher } from '../common';

export default new ContainerModule(bind => {
    bind(IBroadcastClientDispatch).to(BroadcastClientDispatch).inSingletonScope();
    bind(BroadcastWatcher).toSelf().inSingletonScope();
    bind(BroadcastServer).toSelf().inSingletonScope();
    bind(IBroadcastServer).toService(BroadcastServer);
    bind(ConnectionHandler).toDynamicValue(({ container }) =>
        new JsonRpcConnectionHandler<IBroadcastClient>(servicePath, client => {
            const server = container.get<IBroadcastServer>(IBroadcastServer);
            client.onDidOpenConnection(() => server.addClient(client));
            client.onDidCloseConnection(() => server.removeClient(client));
            return container.get<IBroadcastServer>(IBroadcastServer);
        })
    ).inSingletonScope();
});
