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

import { ContainerModule } from 'inversify';
import { BrowserFrontendIdProvider, FrontendIdProvider } from './frontend-id-provider';
import { WebSocketConnectionSource } from './ws-connection-source';
import { LocalConnectionProvider, RemoteConnectionProvider, ServiceConnectionProvider } from './service-connection-provider';
import { ConnectionSource } from './connection-source';
import { ConnectionCloseService, connectionCloseServicePath } from '../../common/messaging/connection-management';
import { WebSocketConnectionProvider } from './ws-connection-provider';

const backendServiceProvider = Symbol('backendServiceProvider');

export const messagingFrontendModule = new ContainerModule(bind => {
    bind(ConnectionCloseService).toDynamicValue(ctx => WebSocketConnectionProvider.createProxy(ctx.container, connectionCloseServicePath)).inSingletonScope();
    bind(BrowserFrontendIdProvider).toSelf().inSingletonScope();
    bind(FrontendIdProvider).toService(BrowserFrontendIdProvider);
    bind(WebSocketConnectionSource).toSelf().inSingletonScope();
    bind(backendServiceProvider).toDynamicValue(ctx => {
        bind(ServiceConnectionProvider).toSelf().inSingletonScope();
        const container = ctx.container.createChild();
        container.bind(ConnectionSource).toService(WebSocketConnectionSource);
        return container.get(ServiceConnectionProvider);
    }).inSingletonScope();
    bind(LocalConnectionProvider).toService(backendServiceProvider);
    bind(RemoteConnectionProvider).toService(backendServiceProvider);
    bind(WebSocketConnectionProvider).toSelf().inSingletonScope();
});
