// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { DevContainerConnectionProvider } from './remote-container-connection-provider';
import { RemoteContainerConnectionProvider, RemoteContainerConnectionProviderPath } from '../electron-common/remote-container-connection-provider';
import { ContainerCreationContribution, DockerContainerService } from './docker-container-service';
import { bindContributionProvider, ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { registerContainerCreationContributions } from './devcontainer-contributions/main-container-creation-contributions';
import { DevContainerFileService } from './dev-container-file-service';
import { ContainerOutputProvider } from '../electron-common/container-output-provider';
import { ExtensionsContribution, registerTheiaStartOptionsContributions, SettingsContribution } from './devcontainer-contributions/cli-enhancing-creation-contributions';
import { RemoteCliContribution } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { ProfileFileModificationContribution } from './devcontainer-contributions/profile-file-modification-contribution';

export const remoteConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindContributionProvider(bind, ContainerCreationContribution);
    registerContainerCreationContributions(bind);
    registerTheiaStartOptionsContributions(bind);
    bind(ProfileFileModificationContribution).toSelf().inSingletonScope();
    bind(ContainerCreationContribution).toService(ProfileFileModificationContribution);

    bind(DevContainerConnectionProvider).toSelf().inSingletonScope();
    bind(RemoteContainerConnectionProvider).toService(DevContainerConnectionProvider);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<ContainerOutputProvider>(RemoteContainerConnectionProviderPath, client => {
            const server = ctx.container.get<RemoteContainerConnectionProvider>(RemoteContainerConnectionProvider);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        }));
});

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(DockerContainerService).toSelf().inSingletonScope();
    bind(ConnectionContainerModule).toConstantValue(remoteConnectionModule);

    bind(DevContainerFileService).toSelf().inSingletonScope();

    bind(ExtensionsContribution).toSelf().inSingletonScope();
    bind(SettingsContribution).toSelf().inSingletonScope();
    bind(RemoteCliContribution).toService(ExtensionsContribution);
    bind(RemoteCliContribution).toService(SettingsContribution);
});
