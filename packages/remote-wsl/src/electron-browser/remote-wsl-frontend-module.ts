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
import { RemoteRegistryContribution } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { RemoteWslConnectionProvider, RemoteWslConnectionProviderPath } from '../electron-common/remote-wsl-connection-provider';
import { WslConnectionContribution } from './wsl-connection-contribution';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { WorkspaceOpenHandlerContribution } from '@theia/workspace/lib/browser/workspace-service';

export default new ContainerModule(bind => {
    bind(WslConnectionContribution).toSelf().inSingletonScope();
    bind(RemoteRegistryContribution).toService(WslConnectionContribution);
    bind(WorkspaceOpenHandlerContribution).toService(WslConnectionContribution);

    bind(RemoteWslConnectionProvider).toDynamicValue(ctx =>
        ServiceConnectionProvider.createLocalProxy<RemoteWslConnectionProvider>(ctx.container, RemoteWslConnectionProviderPath)
    ).inSingletonScope();
});
