/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { ConnectionHandler, JsonRpcConnectionHandler, bindContributionProvider } from "@theia/core/lib/common";
import { ContainerModule } from 'inversify';
import {
    DebugServiceImpl,
    DebugAdapterSessionManager,
    DebugAdapterContributionRegistry
} from "./debug-service";
import {
    DebugPath,
    DebugService
} from "../common/debug-common";
import {
    MessagingServiceContainer,
    LaunchBasedDebugAdapterFactory,
    DebugAdapterSessionImpl,
    DebugAdapterSessionFactoryImpl
} from "./debug-adapter";
import { MessagingService } from "@theia/core/lib/node/messaging/messaging-service";
import {
    DebugAdapterContribution,
    DebugAdapterSessionFactory,
    DebugAdapterSession,
    DebugAdapterFactory
} from './debug-model';

export default new ContainerModule(bind => {
    bind(DebugService).to(DebugServiceImpl).inSingletonScope();
    bind(DebugAdapterSession).to(DebugAdapterSessionImpl);
    bind(DebugAdapterSessionFactory).to(DebugAdapterSessionFactoryImpl).inSingletonScope();
    bind(DebugAdapterFactory).to(LaunchBasedDebugAdapterFactory).inSingletonScope();
    bind(DebugAdapterContributionRegistry).toSelf().inSingletonScope();
    bind(DebugAdapterSessionManager).toSelf().inSingletonScope();
    bind(MessagingServiceContainer).toSelf().inSingletonScope();
    bind(MessagingService.Contribution).toDynamicValue(c => c.container.get(MessagingServiceContainer));
    bindContributionProvider(bind, DebugAdapterContribution);

    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler(DebugPath, client => {
            const service = context.container.get<DebugService>(DebugService);
            client.onDidCloseConnection(() => service.dispose());
            return service;
        })
    ).inSingletonScope();
});
