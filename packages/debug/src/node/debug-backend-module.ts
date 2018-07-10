/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
