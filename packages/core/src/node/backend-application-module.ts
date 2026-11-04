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
    bindRootContributionProvider, MessageService, MessageClient, ConnectionHandler, RpcConnectionHandler,
    CommandService, commandServicePath, messageServicePath, OSBackendProvider, OSBackendProviderPath,
    bindPreferenceConfigurations,
    DefaultsPreferenceProvider,
    PreferenceContribution,
    PreferenceLanguageOverrideService,
    PreferenceSchemaService,
    PreferenceSchemaServiceImpl,
    PreferenceScope,
    ValidPreferenceScopes,
    PreferenceServiceImpl,
    PreferenceService,
    bindTreePreferences,
    PreferenceProviderProvider,
    PreferenceProvider
} from '../common/index.js';
import {
    BackendApplication, BackendApplicationContribution, BackendApplicationCliContribution,
    BackendApplicationServer, BackendApplicationPath, EarlyExpressMiddleware, RootContainer
} from './backend-application.js';
import { CliManager, CliContribution } from './cli.js';
import { IPCConnectionProvider } from './messaging/index.js';
import { ApplicationServerImpl } from './application-server.js';
import { ApplicationServer, applicationPath } from '../common/application-protocol.js';
import { EnvVariablesServer, envVariablesPath } from './../common/env-variables/index.js';
import { EnvVariablesServerImpl } from './env-variables/index.js';
import { ConnectionContainerModule } from './messaging/connection-container-module.js';
import { QuickInputService, quickInputServicePath, QuickPickService, quickPickServicePath } from '../common/quick-pick-service.js';
import { WsRequestValidator, WsRequestValidatorContribution } from './ws-request-validators.js';
import { KeyStoreService, keyStoreServicePath } from '../common/key-store.js';
import { KeyStoreServiceImpl } from './key-store-server.js';
import { ContributionFilterRegistry, ContributionFilterRegistryImpl } from '../common/contribution-filter/index.js';
import { EnvironmentUtils } from './environment-utils.js';
import { ProcessUtils } from './process-utils.js';
import { ProxyCliContribution } from './request/proxy-cli-contribution.js';
import { bindNodeStopwatch, bindBackendStopwatchServer } from './performance/index.js';
import { OSBackendProviderImpl } from './os-backend-provider.js';
import { BackendRequestFacade, BackendRequestAllowedContribution } from './request/backend-request-facade.js';
import { FileSystemLocking, FileSystemLockingImpl } from './filesystem-locking.js';
import { BundledResourceProvider, BundledResourceProviderImpl } from './bundled-resource-provider.js';
import { BackendRemoteService } from './remote/backend-remote-service.js';
import { RemoteCliContribution } from './remote/remote-cli-contribution.js';
import { SettingService, SettingServiceImpl } from './setting-service.js';
import { bindCorePreferences } from '../common/core-preferences.js';

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
    bindRootContributionProvider(bind, CliContribution);

    bind(BackendApplicationCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(BackendApplicationCliContribution);

    bind(EarlyExpressMiddleware).toSelf().inSingletonScope();
    bind(BackendApplication).toSelf().inSingletonScope();
    bind(RootContainer).toDynamicValue(({ container }) => {
        let root = container;
        while (root.parent) {
            root = root.parent;
        }
        return root;
    }).inSingletonScope();
    bindRootContributionProvider(bind, BackendApplicationContribution);
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
    bindRootContributionProvider(bind, WsRequestValidatorContribution);
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

    bindRootContributionProvider(bind, RemoteCliContribution);
    bind(BackendRemoteService).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, BackendRequestAllowedContribution);
    bind(BackendRequestFacade).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(
        ctx => new RpcConnectionHandler(REQUEST_SERVICE_PATH, () => ctx.container.get(BackendRequestFacade))
    ).inSingletonScope();

    bindNodeStopwatch(bind);
    bindBackendStopwatchServer(bind);

    bind(FileSystemLocking).to(FileSystemLockingImpl).inSingletonScope();

    bind(BundledResourceProviderImpl).toSelf().inSingletonScope();
    bind(BundledResourceProvider).toService(BundledResourceProviderImpl);

    bind(SettingServiceImpl).toSelf().inSingletonScope();
    bind(SettingService).toService(SettingServiceImpl);

    bindPreferenceConfigurations(bind);
    bind(ValidPreferenceScopes).toConstantValue([PreferenceScope.Default, PreferenceScope.User]);
    bindRootContributionProvider(bind, PreferenceContribution);
    bind(PreferenceProviderProvider).toFactory(ctx => (scope: PreferenceScope) => ctx.container.getNamed(PreferenceProvider, scope));
    bind(PreferenceSchemaServiceImpl).toSelf().inSingletonScope();
    bind(PreferenceSchemaService).toService(PreferenceSchemaServiceImpl);
    bind(PreferenceProvider).to(DefaultsPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Default);
    bind(PreferenceLanguageOverrideService).toSelf().inSingletonScope();
    bind(PreferenceServiceImpl).toSelf().inSingletonScope();
    bind(PreferenceService).toService(PreferenceServiceImpl);
    bindCorePreferences(bind);
    bindTreePreferences(bind);
});
