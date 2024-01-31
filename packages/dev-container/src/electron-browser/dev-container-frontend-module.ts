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
import { RemoteRegistryContribution } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { RemoteContainerConnectionProvider, RemoteContainerConnectionProviderPath } from '../electron-common/remote-container-connection-provider';
import { ContainerConnectionContribution } from './container-connection-contribution';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(ContainerConnectionContribution).toSelf().inSingletonScope();
    bind(RemoteRegistryContribution).toService(ContainerConnectionContribution);

    bind(RemoteContainerConnectionProvider).toDynamicValue(ctx =>
        ServiceConnectionProvider.createLocalProxy<RemoteContainerConnectionProvider>(ctx.container, RemoteContainerConnectionProviderPath)
    ).inSingletonScope();

});
