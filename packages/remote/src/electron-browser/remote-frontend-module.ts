// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { bindContributionProvider, CommandContribution } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, RemoteService, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { RemoteSSHContribution } from './remote-ssh-contribution';
import { RemoteSSHConnectionProvider, RemoteSSHConnectionProviderPath } from '../electron-common/remote-ssh-connection-provider';
import { RemoteFrontendContribution } from './remote-frontend-contribution';
import { RemoteRegistryContribution } from './remote-registry-contribution';
import { RemoteServiceImpl } from './remote-service-impl';
import { RemoteStatusService, RemoteStatusServicePath } from '../electron-common/remote-status-service';

export default new ContainerModule((bind, _, __, rebind) => {
    bind(RemoteFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(RemoteFrontendContribution);
    bind(CommandContribution).toService(RemoteFrontendContribution);

    bindContributionProvider(bind, RemoteRegistryContribution);
    bind(RemoteSSHContribution).toSelf().inSingletonScope();
    bind(RemoteRegistryContribution).toService(RemoteSSHContribution);

    bind(RemoteServiceImpl).toSelf().inSingletonScope();
    rebind(RemoteService).toService(RemoteServiceImpl);

    bind(RemoteSSHConnectionProvider).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createLocalProxy<RemoteSSHConnectionProvider>(ctx.container, RemoteSSHConnectionProviderPath)).inSingletonScope();
    bind(RemoteStatusService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createLocalProxy<RemoteStatusService>(ctx.container, RemoteStatusServicePath)).inSingletonScope();
});
