// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { ContainerModule, decorate, injectable } from 'inversify';
import { ApplicationPackage } from '@theia/application-package';
import { REQUEST_SERVICE_PATH } from '@theia/request';
import {
    bindContributionProvider, MessageService, MessageClient, ConnectionHandler, RpcConnectionHandler,
    CommandService, commandServicePath, messageServicePath, OSBackendProvider, OSBackendProviderPath
} from '../common';
import { BackendApplication, BackendApplicationContribution, BackendApplicationCliContribution, BackendApplicationServer, BackendApplicationPath } from './backend-application';
import { CliManager, CliContribution } from './cli';
import { IPCConnectionProvider } from './messaging';
import { ApplicationServerImpl } from './application-server';
import { ApplicationServer, applicationPath } from '../common/application-protocol';
import { EnvVariablesServer, envVariablesPath } from './../common/env-variables';
import { EnvVariablesServerImpl } from './env-variables';
import { ConnectionContainerModule } from './messaging/connection-container-module';
import { QuickInputService, quickInputServicePath, QuickPickService, quickPickServicePath } from '../common/quick-pick-service';
import { WsRequestValidator, WsRequestValidatorContribution } from './ws-request-validators';
import { KeyStoreService, keyStoreServicePath } from '../common/key-store';
import { KeyStoreServiceImpl } from './key-store-server';
import { ContributionFilterRegistry, ContributionFilterRegistryImpl } from '../common/contribution-filter';
import { EnvironmentUtils } from './environment-utils';
import { ProcessUtils } from './process-utils';
import { ProxyCliContribution } from './request/proxy-cli-contribution';
import { bindNodeStopwatch, bindBackendStopwatchServer } from './performance';
import { OSBackendProviderImpl } from './os-backend-provider';
import { BackendRequestFacade } from './request/backend-request-facade';
import { FileSystemLocking, FileSystemLockingImpl } from './filesystem-locking';
import { BackendRemoteService } from './remote/backend-remote-service';
import { RemoteCliContribution } from './remote/remote-cli-contribution';

decorate(injectable(), ApplicationPackage);

const commandConnectionModule = ConnectionContainerModule.create(({ bindFrontendService }) => {
    bindFrontendService(commandServicePath, CommandService);
});

const messageConnectionModule = ConnectionContainerModule.create(({ bind, bindFrontendService }) => {
    bindFrontendService(messageServicePath, MessageClient);
    bind(MessageService).toSelf().inSingletonScope();
});

const quickPickConnectionModule = ConnectionContainerModule.create(({ bindFrontendService }) => {
    bindFrontendService(quickInputServicePath, QuickInputService);
    bindFrontendService(quickPickServicePath, QuickPickService);
});

export const backendApplicationModule = new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(commandConnectionModule);
    bind(ConnectionContainerModule).toConstantValue(messageConnectionModule);
    bind(ConnectionContainerModule).toConstantValue(quickPickConnectionModule);

    bind(CliManager).toSelf().inSingletonScope();
    bindContributionProvider(bind, CliContribution);

    bind(BackendApplicationCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(BackendApplicationCliContribution);

    bind(BackendApplication).toSelf().inSingletonScope();
    bindContributionProvider(bind, BackendApplicationContribution);
    // Bind the BackendApplicationServer as a BackendApplicationContribution
    // and fallback to an empty contribution if never bound.
    bind(BackendApplicationContribution).toDynamicValue(ctx => {
        if (ctx.container.isBound(BackendApplicationServer)) {
            return ctx.container.get(BackendApplicationServer);
        } else {
            console.warn('no BackendApplicationServer is set, frontend might not be available');
            return {};
        }
    }).inSingletonScope();

    bind(IPCConnectionProvider).toSelf().inSingletonScope();

    bind(ApplicationServerImpl).toSelf().inSingletonScope();
    bind(ApplicationServer).toService(ApplicationServerImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(applicationPath, () =>
            ctx.container.get(ApplicationServer)
        )
    ).inSingletonScope();

    bind(EnvVariablesServer).to(EnvVariablesServerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(envVariablesPath, () => {
            const envVariablesServer = ctx.container.get<EnvVariablesServer>(EnvVariablesServer);
            return envVariablesServer;
        })
    ).inSingletonScope();

    bind(ApplicationPackage).toConstantValue(new ApplicationPackage({ projectPath: BackendApplicationPath }));

    bind(WsRequestValidator).toSelf().inSingletonScope();
    bindContributionProvider(bind, WsRequestValidatorContribution);
    bind(KeyStoreService).to(KeyStoreServiceImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(keyStoreServicePath, () => ctx.container.get<KeyStoreService>(KeyStoreService))
    ).inSingletonScope();

    bind(ContributionFilterRegistry).to(ContributionFilterRegistryImpl).inSingletonScope();

    bind(EnvironmentUtils).toSelf().inSingletonScope();
    bind(ProcessUtils).toSelf().inSingletonScope();

    bind(OSBackendProviderImpl).toSelf().inSingletonScope();
    bind(OSBackendProvider).toService(OSBackendProviderImpl);
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(OSBackendProviderPath, () => ctx.container.get(OSBackendProvider))
    ).inSingletonScope();

    bind(ProxyCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(ProxyCliContribution);

    bindContributionProvider(bind, RemoteCliContribution);
    bind(BackendRemoteService).toSelf().inSingletonScope();
    bind(BackendRequestFacade).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(REQUEST_SERVICE_PATH, () => ctx.container.get(BackendRequestFacade))
    ).inSingletonScope();

    bindNodeStopwatch(bind);
    bindBackendStopwatchServer(bind);

    bind(FileSystemLocking).to(FileSystemLockingImpl).inSingletonScope();
});
