/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContainerModule, interfaces, decorate, injectable } from 'inversify';
import { ApplicationPackage } from '@theia/application-package';
import {
    bindContributionProvider, MessageService, MessageClient, ConnectionHandler, JsonRpcConnectionHandler,
    CommandService, commandServicePath, JsonRpcProxyFactory, messageServicePath
} from '../common';
import { BackendApplication, BackendApplicationContribution, BackendApplicationCliContribution } from './backend-application';
import { CliManager, CliContribution } from './cli';
import { ServerProcess, RemoteMasterProcessFactory, clusterRemoteMasterProcessFactory } from './cluster';
import { IPCConnectionProvider } from './messaging';
import { ApplicationServerImpl } from './application-server';
import { ApplicationServer, applicationPath } from '../common/application-protocol';
import { EnvVariablesServer, envVariablesPath } from './../common/env-variables';
import { EnvVariablesServerImpl } from './env-variables';
import { ConnectionContainerModule } from './messaging/messaging-contribution';

decorate(injectable(), ApplicationPackage);

export function bindServerProcess(bind: interfaces.Bind, masterFactory: RemoteMasterProcessFactory): void {
    bind(RemoteMasterProcessFactory).toConstantValue(masterFactory);
    bind(ServerProcess).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(ServerProcess);
}

const commandConnectionModule = new ContainerModule(bind => {
    const commandServiceFactory = new JsonRpcProxyFactory<CommandService>();
    const commandService = commandServiceFactory.createProxy();
    bind<ConnectionHandler>(ConnectionHandler).toConstantValue({
        path: commandServicePath,
        onConnection: connection => commandServiceFactory.listen(connection)
    });
    bind<CommandService>(CommandService).toConstantValue(commandService);
});

const messageConnectionModule = new ContainerModule(bind => {
    const messageClientFactory = new JsonRpcProxyFactory<MessageClient>();
    const messageClient = messageClientFactory.createProxy();
    bind<ConnectionHandler>(ConnectionHandler).toConstantValue({
        path: messageServicePath,
        onConnection: connection => messageClientFactory.listen(connection)
    });
    bind<MessageClient>(MessageClient).toConstantValue(messageClient);
    bind(MessageService).toSelf().inSingletonScope();
});

export const backendApplicationModule = new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(commandConnectionModule);
    bind(ConnectionContainerModule).toConstantValue(messageConnectionModule);

    bind(CliManager).toSelf().inSingletonScope();
    bindContributionProvider(bind, CliContribution);

    bind(BackendApplicationCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(BackendApplicationCliContribution);

    bind(BackendApplication).toSelf().inSingletonScope();
    bindContributionProvider(bind, BackendApplicationContribution);

    bindServerProcess(bind, clusterRemoteMasterProcessFactory);

    bind(IPCConnectionProvider).toSelf().inSingletonScope();

    bind(ApplicationServerImpl).toSelf().inSingletonScope();
    bind(ApplicationServer).toService(ApplicationServerImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(applicationPath, () =>
            ctx.container.get(ApplicationServer)
        )
    ).inSingletonScope();

    bind(EnvVariablesServer).to(EnvVariablesServerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(envVariablesPath, () => {
            const envVariablesServer = ctx.container.get<EnvVariablesServer>(EnvVariablesServer);
            return envVariablesServer;
        })
    ).inSingletonScope();

    bind(ApplicationPackage).toDynamicValue(({ container }) => {
        const { projectPath } = container.get(BackendApplicationCliContribution);
        return new ApplicationPackage({ projectPath });
    }).inSingletonScope();
});
