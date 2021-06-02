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

import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { ContainerModule } from '@theia/core/shared/inversify';
import { createCommonBindings } from '../common/terminal-common-module';
import { RemoteTerminalServer, REMOTE_TERMINAL_PATH } from '../common/terminal-protocol';
import { RemoteTerminalConnectionHandler, RemoteTerminalConnectionHandlerImpl } from './remote-terminal-connection-handler';
import { RemoteTerminalServerImpl } from './remote-terminal-server';
import { GlobalTerminalRegistry, TerminalRegistry, TerminalRegistryImpl, GlobalTerminalIdSequence } from './terminal-registry';

export default new ContainerModule(bind => {
    createCommonBindings(bind);
    bind(TerminalRegistry).to(TerminalRegistryImpl).inTransientScope();
    bind(RemoteTerminalServer).to(RemoteTerminalServerImpl).inTransientScope();
    bind(RemoteTerminalConnectionHandler).to(RemoteTerminalConnectionHandlerImpl).inSingletonScope();
    bind(GlobalTerminalIdSequence).toSelf().inSingletonScope();
    bind(GlobalTerminalRegistry).toDynamicValue(ctx => ctx.container.get(TerminalRegistry)).inSingletonScope();
    // Handle REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE
    bind(MessagingService.Contribution).toService(RemoteTerminalConnectionHandler);
    // Handle REMOTE_TERMINAL_PATH
    bind(ConnectionHandler).toDynamicValue(
        ctx => new JsonRpcConnectionHandler(REMOTE_TERMINAL_PATH,
            // Will create a new RemoteTerminalServer instance per connection
            () => ctx.container.get(RemoteTerminalServer)
        )
    ).inSingletonScope();
});
