/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces } from "inversify";
import { bindContributionProvider, MessageService, MessageClient } from '../common';
import { BackendApplication, BackendApplicationContribution, BackendApplicationCliContribution } from './backend-application';
import { CliManager, CliContribution } from './cli';
import { ServerProcess, RemoteMasterProcessFactory, clusterRemoteMasterProcessFactory } from './cluster';
import { IPCConnectionProvider } from "./messaging";
import { BackendConnectionStatusEndpoint } from './backend-connection-status';

export function bindServerProcess(bind: interfaces.Bind, masterFactory: RemoteMasterProcessFactory): void {
    bind(RemoteMasterProcessFactory).toConstantValue(masterFactory);
    bind(ServerProcess).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(ServerProcess)).inSingletonScope();
}

export const backendApplicationModule = new ContainerModule(bind => {
    bind(CliManager).toSelf().inSingletonScope();
    bindContributionProvider(bind, CliContribution);

    bind(BackendApplicationCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toDynamicValue(ctx => ctx.container.get(BackendApplicationCliContribution));

    bind(BackendApplication).toSelf().inSingletonScope();
    bindContributionProvider(bind, BackendApplicationContribution);

    bindServerProcess(bind, clusterRemoteMasterProcessFactory);

    bind(MessageClient).toSelf().inSingletonScope();
    bind(MessageService).toSelf().inSingletonScope();

    bind(IPCConnectionProvider).toSelf().inSingletonScope();

    bind(BackendConnectionStatusEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(BackendConnectionStatusEndpoint)).inSingletonScope();
});
