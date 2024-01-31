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
import { DockerContainerCreationService } from './docker-container-creation-service';

export const remoteConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(DevContainerConnectionProvider).toSelf().inSingletonScope();
    bind(RemoteContainerConnectionProvider).toService(DevContainerConnectionProvider);
    bindBackendService(RemoteContainerConnectionProviderPath, RemoteContainerConnectionProvider);
});

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(DockerContainerCreationService).toSelf().inSingletonScope();
    bind(ConnectionContainerModule).toConstantValue(remoteConnectionModule);
});
