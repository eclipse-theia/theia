// *****************************************************************************
// Copyright (C) 2018-2021 Red Hat, Inc. and others.
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

import * as path from 'path';
import { interfaces } from '@theia/core/shared/inversify';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { CliContribution } from '@theia/core/lib/node/cli';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { MetadataScanner } from './metadata-scanner.js';
import { BackendPluginHostableFilter, HostedPluginServerImpl } from './plugin-service.js';
import { HostedPluginReader } from './plugin-reader.js';
import { HostedPluginSupport } from './hosted-plugin.js';
import { TheiaPluginScanner } from './scanners/scanner-theia.js';
import { HostedPluginServer, PluginScanner, HostedPluginClient, hostedServicePath, PluginDeployerHandler, PluginHostEnvironmentVariable } from '../../common/plugin-protocol.js';
import { GrammarsReader } from './scanners/grammars-reader.js';
import { HostedPluginProcess, HostedPluginProcessConfiguration } from './hosted-plugin-process.js';
import { ExtPluginApiProvider } from '../../common/plugin-ext-api-contribution.js';
import { HostedPluginCliContribution } from './hosted-plugin-cli-contribution.js';
import { PluginDeployerHandlerImpl } from './plugin-deployer-handler-impl.js';
import { PluginUriFactory } from './scanners/plugin-uri-factory.js';
import { FilePluginUriFactory } from './scanners/file-plugin-uri-factory.js';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service.js';
import { LanguagePackService, languagePackServicePath } from '../../common/language-pack-service.js';
import { PluginLanguagePackService } from './plugin-language-pack-service.js';
import { RpcConnectionHandler } from '@theia/core/lib/common/messaging/proxy-factory';
import { ConnectionHandler } from '@theia/core/lib/common/messaging/handler';
import { isConnectionScopedBackendPlugin } from '../common/hosted-plugin.js';

const commonHostedConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(HostedPluginProcess).toSelf().inSingletonScope();
    bind(HostedPluginSupport).toSelf().inSingletonScope();

    bindContributionProvider(bind, Symbol.for(ExtPluginApiProvider));
    bindContributionProvider(bind, PluginHostEnvironmentVariable);

    bind(HostedPluginServerImpl).toSelf().inSingletonScope();
    bind(HostedPluginServer).toService(HostedPluginServerImpl);
    bind(BackendPluginHostableFilter).toConstantValue(isConnectionScopedBackendPlugin);
    bindBackendService<HostedPluginServer, HostedPluginClient>(hostedServicePath, HostedPluginServer, (server, client) => {
        server.setClient(client);
        client.onDidCloseConnection(() => server.dispose());
        return server;
    });
});

export function bindCommonHostedBackend(bind: interfaces.Bind): void {
    bind(HostedPluginCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(HostedPluginCliContribution);

    bind(MetadataScanner).toSelf().inSingletonScope();
    bind(HostedPluginReader).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(HostedPluginReader);

    bind(HostedPluginLocalizationService).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(HostedPluginLocalizationService);
    bind(PluginDeployerHandlerImpl).toSelf().inSingletonScope();
    bind(PluginDeployerHandler).toService(PluginDeployerHandlerImpl);

    bind(PluginLanguagePackService).toSelf().inSingletonScope();
    bind(LanguagePackService).toService(PluginLanguagePackService);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(languagePackServicePath, () =>
            ctx.container.get(LanguagePackService)
        )
    ).inSingletonScope();

    bind(GrammarsReader).toSelf().inSingletonScope();
    bind(HostedPluginProcessConfiguration).toConstantValue({
        path: path.join(import.meta.dirname, 'plugin-host'),
    });

    bind(ConnectionContainerModule).toConstantValue(commonHostedConnectionModule);
    bind(PluginUriFactory).to(FilePluginUriFactory).inSingletonScope();
}

export function bindHostedBackend(bind: interfaces.Bind): void {
    bindCommonHostedBackend(bind);

    bind(PluginScanner).to(TheiaPluginScanner).inSingletonScope();
}
