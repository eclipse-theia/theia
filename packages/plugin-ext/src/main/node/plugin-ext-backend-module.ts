// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { PluginApiContribution } from './plugin-service';
import { BackendApplicationContribution, CliContribution } from '@theia/core/lib/node';
import { WsRequestValidatorContribution } from '@theia/core/lib/node/ws-request-validators';
import { PluginsKeyValueStorage } from './plugins-key-value-storage';
import { PluginDeployerContribution } from './plugin-deployer-contribution';
import {
    PluginDeployer, PluginDeployerResolver, PluginDeployerFileHandler,
    PluginDeployerDirectoryHandler, PluginServer, pluginServerJsonRpcPath, PluginDeployerParticipant
} from '../../common/plugin-protocol';
import { PluginDeployerImpl } from './plugin-deployer-impl';
import { LocalDirectoryPluginDeployerResolver } from './resolvers/local-directory-plugin-deployer-resolver';
import { PluginTheiaFileHandler } from './handlers/plugin-theia-file-handler';
import { PluginTheiaDirectoryHandler } from './handlers/plugin-theia-directory-handler';
import { GithubPluginDeployerResolver } from './plugin-github-resolver';
import { HttpPluginDeployerResolver } from './plugin-http-resolver';
import { ConnectionHandler, RpcConnectionHandler, bindContributionProvider } from '@theia/core';
import { PluginPathsService, pluginPathsServicePath } from '../common/plugin-paths-protocol';
import { PluginPathsServiceImpl } from './paths/plugin-paths-service';
import { PluginServerHandler } from './plugin-server-handler';
import { PluginCliContribution } from './plugin-cli-contribution';
import { PluginTheiaEnvironment } from '../common/plugin-theia-environment';
import { PluginTheiaDeployerParticipant } from './plugin-theia-deployer-participant';
import { WebviewBackendSecurityWarnings } from './webview-backend-security-warnings';
import { PluginUninstallationManager } from './plugin-uninstallation-manager';
import { LocalizationServerImpl } from '@theia/core/lib/node/i18n/localization-server';
import { PluginLocalizationServer } from './plugin-localization-server';
import { PluginMgmtCliContribution } from './plugin-mgmt-cli-contribution';
import { PluginRemoteCliContribution } from './plugin-remote-cli-contribution';
import { RemoteCliContribution } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { PluginRemoteCopyContribution } from './plugin-remote-copy-contribution';
import { RemoteCopyContribution } from '@theia/core/lib/node/remote/remote-copy-contribution';

export function bindMainBackend(bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind): void {
    bind(PluginApiContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(PluginApiContribution);
    bind(WsRequestValidatorContribution).toService(PluginApiContribution);

    bindContributionProvider(bind, PluginDeployerParticipant);
    bind(PluginDeployer).to(PluginDeployerImpl).inSingletonScope();
    bind(PluginDeployerContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(PluginDeployerContribution);

    bind(PluginUninstallationManager).toSelf().inSingletonScope();

    bind(PluginDeployerResolver).to(LocalDirectoryPluginDeployerResolver).inSingletonScope();
    bind(PluginDeployerResolver).to(GithubPluginDeployerResolver).inSingletonScope();
    bind(PluginDeployerResolver).to(HttpPluginDeployerResolver).inSingletonScope();

    bind(PluginTheiaEnvironment).toSelf().inSingletonScope();
    bind(PluginTheiaDeployerParticipant).toSelf().inSingletonScope();
    bind(PluginDeployerParticipant).toService(PluginTheiaDeployerParticipant);

    bind(PluginDeployerFileHandler).to(PluginTheiaFileHandler).inSingletonScope();
    bind(PluginDeployerDirectoryHandler).to(PluginTheiaDirectoryHandler).inSingletonScope();

    bind(PluginServer).to(PluginServerHandler).inSingletonScope();

    bind(PluginsKeyValueStorage).toSelf().inSingletonScope();

    bind(PluginPathsService).to(PluginPathsServiceImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(pluginPathsServicePath, () =>
            ctx.container.get(PluginPathsService)
        )
    ).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(pluginServerJsonRpcPath, () =>
            ctx.container.get(PluginServer)
        )
    ).inSingletonScope();

    bind(PluginCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(PluginCliContribution);

    bind(PluginMgmtCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(PluginMgmtCliContribution);

    bind(PluginRemoteCliContribution).toSelf().inSingletonScope();
    bind(RemoteCliContribution).toService(PluginRemoteCliContribution);
    bind(PluginRemoteCopyContribution).toSelf().inSingletonScope();
    bind(RemoteCopyContribution).toService(PluginRemoteCopyContribution);

    bind(WebviewBackendSecurityWarnings).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(WebviewBackendSecurityWarnings);

    rebind(LocalizationServerImpl).to(PluginLocalizationServer).inSingletonScope();

}
