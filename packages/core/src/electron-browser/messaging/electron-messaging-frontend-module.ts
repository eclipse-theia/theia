// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import { FrontendApplicationContribution } from '../../browser/frontend-application-contribution';
import { ElectronWebSocketConnectionSource } from './electron-ws-connection-source';
import { ElectronIpcConnectionSource, ElectronMainConnectionProvider } from './electron-ipc-connection-source';
import { ElectronLocalWebSocketConnectionSource, getLocalPort } from './electron-local-ws-connection-source';
import { ElectronFrontendIdProvider } from './electron-frontend-id-provider';
import { FrontendIdProvider } from '../../browser/messaging/frontend-id-provider';
import { ConnectionSource } from '../../browser/messaging/connection-source';
import { LocalConnectionProvider, RemoteConnectionProvider, ServiceConnectionProvider } from '../../browser/messaging/service-connection-provider';
import { WebSocketConnectionProvider } from '../../browser/messaging/ws-connection-provider';
import { ConnectionCloseService, connectionCloseServicePath } from '../../common/messaging/connection-management';
import { WebSocketConnectionSource } from '../../browser/messaging/ws-connection-source';

const backendServiceProvider = Symbol('backendServiceProvider2');
const localServiceProvider = Symbol('localServiceProvider');

export const messagingFrontendModule = new ContainerModule(bind => {
    bind(ConnectionCloseService).toDynamicValue(ctx => WebSocketConnectionProvider.createProxy(ctx.container, connectionCloseServicePath)).inSingletonScope();
    bind(ElectronWebSocketConnectionSource).toSelf().inSingletonScope();
    bind(WebSocketConnectionSource).toService(ElectronWebSocketConnectionSource);
    bind(ElectronIpcConnectionSource).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ElectronIpcConnectionSource);
    bind(ElectronLocalWebSocketConnectionSource).toSelf().inSingletonScope();
    bind(backendServiceProvider).toDynamicValue(ctx => {
        const container = ctx.container.createChild();
        container.bind(ServiceConnectionProvider).toSelf().inSingletonScope();
        container.bind(ConnectionSource).toService(ElectronWebSocketConnectionSource);
        return container.get(ServiceConnectionProvider);
    }).inSingletonScope();

    bind(localServiceProvider).toDynamicValue(ctx => {
        const container = ctx.container.createChild();
        container.bind(ServiceConnectionProvider).toSelf().inSingletonScope();
        container.bind(ConnectionSource).toService(ElectronLocalWebSocketConnectionSource);
        return container.get(ServiceConnectionProvider);
    }).inSingletonScope();

    bind(ElectronMainConnectionProvider).toDynamicValue(ctx => {
        const container = ctx.container.createChild();
        container.bind(ServiceConnectionProvider).toSelf().inSingletonScope();
        container.bind(ConnectionSource).toService(ElectronIpcConnectionSource);
        return container.get(ServiceConnectionProvider);
    }).inSingletonScope();

    bind(LocalConnectionProvider).toDynamicValue(ctx => {
        const localPort = getLocalPort();
        if (localPort) {
            // Return new web socket provider that connects to local app
            return ctx.container.get(localServiceProvider);
        } else {
            // Return the usual web socket provider that already established its connection
            // That way we don't create a second socket connection
            return ctx.container.get(backendServiceProvider);
        }
    }).inSingletonScope();
    bind(RemoteConnectionProvider).toService(backendServiceProvider);

    bind(FrontendApplicationContribution).toService(ElectronWebSocketConnectionSource);
    bind(ElectronFrontendIdProvider).toSelf().inSingletonScope();
    bind(FrontendIdProvider).toService(ElectronFrontendIdProvider);
    bind(WebSocketConnectionProvider).toSelf().inSingletonScope();
});
