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

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution, CliContribution } from '@theia/core/lib/node';
import { RemoteConnectionService } from './remote-connection-service';
import { RemoteProxyServerProvider } from './remote-proxy-server-provider';
import { RemoteConnectionSocketProvider } from './remote-connection-socket-provider';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { RemoteSSHConnectionProvider, RemoteSSHConnectionProviderPath } from '../electron-common/remote-ssh-connection-provider';
import { RemoteSSHConnectionProviderImpl } from './ssh/remote-ssh-connection-provider';
import { SSHIdentityFileCollector } from './ssh/ssh-identity-file-collector';
import { RemoteCopyService } from './setup/remote-copy-service';
import { RemoteSetupService } from './setup/remote-setup-service';
import { RemoteNativeDependencyService } from './setup/remote-native-dependency-service';
import { BackendRemoteServiceImpl } from './backend-remote-service-impl';
import { BackendRemoteService } from '@theia/core/lib/node/remote/backend-remote-service';
import { RemoteNodeSetupService } from './setup/remote-node-setup-service';
import { RemotePosixScriptStrategy, RemoteSetupScriptService, RemoteWindowsScriptStrategy } from './setup/remote-setup-script-service';
import { RemoteStatusService, RemoteStatusServicePath } from '../electron-common/remote-status-service';
import { RemoteStatusServiceImpl } from './remote-status-service';
import { ConnectionHandler, RpcConnectionHandler, bindContributionProvider } from '@theia/core';
import { RemoteCopyRegistryImpl } from './setup/remote-copy-contribution';
import { RemoteCopyContribution } from '@theia/core/lib/node/remote/remote-copy-contribution';
import { MainCopyContribution } from './setup/main-copy-contribution';
import { RemoteNativeDependencyContribution } from './setup/remote-native-dependency-contribution';
import { AppNativeDependencyContribution } from './setup/app-native-dependency-contribution';
import { RemotePortForwardingProviderImpl } from './remote-port-forwarding-provider';
import { RemotePortForwardingProvider, RemoteRemotePortForwardingProviderPath } from '../electron-common/remote-port-forwarding-provider';

export const remoteConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(RemoteSSHConnectionProviderImpl).toSelf().inSingletonScope();
    bind(RemoteSSHConnectionProvider).toService(RemoteSSHConnectionProviderImpl);
    bindBackendService(RemoteSSHConnectionProviderPath, RemoteSSHConnectionProvider);

    bind(RemotePortForwardingProviderImpl).toSelf().inSingletonScope();
    bind(RemotePortForwardingProvider).toService(RemotePortForwardingProviderImpl);
    bindBackendService(RemoteRemotePortForwardingProviderPath, RemotePortForwardingProvider);
});

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(RemoteProxyServerProvider).toSelf().inSingletonScope();
    bind(RemoteConnectionSocketProvider).toSelf().inSingletonScope();
    bind(RemoteConnectionService).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(RemoteConnectionService);
    bind(RemoteStatusServiceImpl).toSelf().inSingletonScope();
    bind(RemoteStatusService).toService(RemoteStatusServiceImpl);
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(RemoteStatusServicePath, () => ctx.container.get(RemoteStatusService))
    ).inSingletonScope();

    bind(RemoteCopyService).toSelf().inSingletonScope();
    bind(RemoteSetupService).toSelf().inSingletonScope();
    bind(RemoteNodeSetupService).toSelf().inSingletonScope();
    bind(RemoteWindowsScriptStrategy).toSelf().inSingletonScope();
    bind(RemotePosixScriptStrategy).toSelf().inSingletonScope();
    bind(RemoteSetupScriptService).toSelf().inSingletonScope();
    bind(RemoteNativeDependencyService).toSelf().inSingletonScope();
    bind(RemoteCopyRegistryImpl).toSelf().inSingletonScope();
    bindContributionProvider(bind, RemoteCopyContribution);
    bindContributionProvider(bind, RemoteNativeDependencyContribution);
    bind(MainCopyContribution).toSelf().inSingletonScope();
    bind(RemoteCopyContribution).toService(MainCopyContribution);
    bind(AppNativeDependencyContribution).toSelf().inSingletonScope();
    bind(RemoteNativeDependencyContribution).toService(AppNativeDependencyContribution);

    bind(ConnectionContainerModule).toConstantValue(remoteConnectionModule);

    bind(BackendRemoteServiceImpl).toSelf().inSingletonScope();
    rebind(BackendRemoteService).toService(BackendRemoteServiceImpl);
    bind(CliContribution).toService(BackendRemoteServiceImpl);

    bind(SSHIdentityFileCollector).toSelf().inSingletonScope();
});
