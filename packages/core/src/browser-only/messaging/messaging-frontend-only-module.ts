// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
import { WebSocketConnectionSource } from '../../browser/messaging/ws-connection-source';
import { FrontendOnlyConnectionSource, FrontendOnlyServiceConnectionProvider } from './frontend-only-service-connection-provider';
import { ConnectionSource } from '../../browser/messaging/connection-source';
import { LocalConnectionProvider, RemoteConnectionProvider } from '../../browser/messaging/service-connection-provider';

// is loaded directly after the regular message frontend module
export const messagingFrontendOnlyModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    unbind(WebSocketConnectionSource);
    bind(FrontendOnlyConnectionSource).toSelf().inSingletonScope();
    if (isBound(ConnectionSource)) {
        rebind(ConnectionSource).toService(FrontendOnlyConnectionSource);
    } else {
        bind(ConnectionSource).toService(FrontendOnlyConnectionSource);
    }
    bind(FrontendOnlyServiceConnectionProvider).toSelf().inSingletonScope();
    if (isBound(LocalConnectionProvider)) {
        rebind(LocalConnectionProvider).toService(FrontendOnlyServiceConnectionProvider);
    } else {
        bind(LocalConnectionProvider).toService(FrontendOnlyServiceConnectionProvider);
    }
    if (isBound(RemoteConnectionProvider)) {
        rebind(RemoteConnectionProvider).toService(FrontendOnlyServiceConnectionProvider);
    } else {
        bind(RemoteConnectionProvider).toService(FrontendOnlyServiceConnectionProvider);
    }
});
