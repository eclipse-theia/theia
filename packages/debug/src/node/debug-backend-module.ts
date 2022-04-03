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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { AnyConnection, BackendAndFrontend, bindContributionProvider, ConnectionHandler, ContainerScope, ILogger, RouteHandlerProvider } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    ConnectionAsChannel,
    DebugAdapterPath,
    DebugPath,
    DebugService
} from '../common/debug-service';
import {
    LaunchBasedDebugAdapterFactory,
    DebugAdapterSessionFactoryImpl
} from './debug-adapter-factory';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import {
    DebugAdapterContribution,
    DebugAdapterSessionFactory,
    DebugAdapterFactory
} from './debug-model';
import { DebugServiceImpl } from './debug-service-impl';
import { DebugAdapterContributionRegistry } from './debug-adapter-contribution-registry';
import { DebugAdapterSessionManager } from './debug-adapter-session-manager';

const debugConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindContributionProvider(bind, DebugAdapterContribution);
    bind(DebugAdapterContributionRegistry).toSelf().inSingletonScope();

    bind(DebugServiceImpl).toSelf().inSingletonScope();
    bind(DebugService).toService(DebugServiceImpl);
    bind(ContainerScope.Destroy).toService(DebugServiceImpl);
    bindBackendService(DebugPath, DebugService);
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(debugConnectionModule);

    bind(DebugAdapterSessionFactory).to(DebugAdapterSessionFactoryImpl).inSingletonScope();
    bind(DebugAdapterFactory).to(LaunchBasedDebugAdapterFactory).inSingletonScope();
    bind(DebugAdapterSessionManager).toSelf().inSingletonScope();

    bind(ConnectionHandler)
        .toDynamicValue(ctx => {
            const debugAdapterManager = ctx.container.get(DebugAdapterSessionManager);
            return ctx.container.get(RouteHandlerProvider)
                .createRouteHandler<AnyConnection, { id: string }>(DebugAdapterPath + '/:id', (params, accept, next) => {
                    const id = params.route.params.id;
                    const session = debugAdapterManager.find(id);
                    if (!session) {
                        return next(new Error(`unknown session id=${id}`));
                    }
                    const channel = new ConnectionAsChannel(accept());
                    session.start(channel);
                });
        })
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);

    bind(ILogger).toDynamicValue(({ container }) =>
        container.get<ILogger>(ILogger).child('debug')
    ).inSingletonScope().whenTargetNamed('debug');
});
