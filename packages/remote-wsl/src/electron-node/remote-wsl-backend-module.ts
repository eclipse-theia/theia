// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { RemoteWslConnectionProviderImpl } from './remote-wsl-connection-provider';
import { RemoteWslConnectionProvider, RemoteWslConnectionProviderPath } from '../electron-common/remote-wsl-connection-provider';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { WslWorkspaceHandler } from './wsl-workspace-handler';
import { WorkspaceHandlerContribution } from '@theia/workspace/lib/node/default-workspace-server';

export const wslRemoteConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(RemoteWslConnectionProviderImpl).toSelf().inSingletonScope();
    bind(RemoteWslConnectionProvider).toService(RemoteWslConnectionProviderImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<RemoteWslConnectionProvider>(RemoteWslConnectionProviderPath, client => {
            const server = ctx.container.get<RemoteWslConnectionProvider>(RemoteWslConnectionProvider);
            return server;
        }));
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(wslRemoteConnectionModule);

    bind(WslWorkspaceHandler).toSelf().inSingletonScope();
    bind(WorkspaceHandlerContribution).toService(WslWorkspaceHandler);

});
