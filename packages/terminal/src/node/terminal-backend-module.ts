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

import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import * as rt from '../common/remote-terminal-protocol';
import * as tv from '../common/terminal-variables';
import { createCommonBindings } from '../common/terminal-common-module';
import { RemoteTerminalConnectionHandler, RemoteTerminalConnectionHandlerImpl } from './remote-terminal-connection-handler';
import { RemoteTerminalServerImpl } from './remote-terminal-server';
import { TerminalIdSequence, GlobalTerminalRegistry, TerminalRegistry, TerminalRegistryImpl } from './terminal-registry';
import { ConnectionContainerModule } from '@theia/core/src/node/messaging/connection-container-module';
import { VariableCollectionsServerImpl } from './environment-collections-server';
import { ConnectionHandler, JsonRpcProxyFactory, Disposable } from '@theia/core';

export const TerminalConnectionModule = Symbol('TerminalConnectionModule');

export default new ContainerModule(bind => {
    createCommonBindings(bind);
    bind(TerminalIdSequence).toSelf().inSingletonScope();
    bind(TerminalRegistry).to(TerminalRegistryImpl).inTransientScope();
    bind(GlobalTerminalRegistry).toDynamicValue(ctx => ctx.container.get(TerminalRegistry)).inSingletonScope();
    bind(RemoteTerminalConnectionHandler).to(RemoteTerminalConnectionHandlerImpl).inSingletonScope();
    bind(MessagingService.Contribution).toService(RemoteTerminalConnectionHandler);
    bind(tv.VariableCollectionsService).to(VariableCollectionsServerImpl).inSingletonScope();
    bind(TerminalConnectionModule).toConstantValue(ConnectionContainerModule.create(container => {
        container.bind(rt.RemoteTerminalServer).to(RemoteTerminalServerImpl).inSingletonScope();
        container.bind(tv.VariableCollectionsServer).to(VariableCollectionsServerImpl).inSingletonScope();
        container.bindBackendService(tv.VARIABLE_COLLECTIONS_PATH, tv.VariableCollectionsServer);
        container.bind(ConnectionHandler).toDynamicValue(DynamicRemoteTerminalServerConnectionHandler).inSingletonScope();
    }));
    bind(ConnectionContainerModule).toService(TerminalConnectionModule);
});

/**
 * `RemoteTerminalServer` must be bound.
 */
export function DynamicRemoteTerminalServerConnectionHandler(ctx: interfaces.Context): ConnectionHandler {
    const server = ctx.container.get(rt.RemoteTerminalServer);
    return {
        path: rt.REMOTE_TERMINAL_PATH,
        onConnection: connection => {
            if (Disposable.is(server)) {
                connection.onDispose(() => server.dispose());
            }
            const factory = new JsonRpcProxyFactory(server);
            factory.listen(connection);
        }
    };
}
