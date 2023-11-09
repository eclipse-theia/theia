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
import { LocalWebSocketConnectionProvider, WebSocketConnectionProvider } from '../../browser/messaging/ws-connection-provider';
import { ElectronWebSocketConnectionProvider } from './electron-ws-connection-provider';
import { ElectronIpcConnectionProvider } from './electron-ipc-connection-provider';
import { ElectronLocalWebSocketConnectionProvider, getLocalPort } from './electron-local-ws-connection-provider';

export const messagingFrontendModule = new ContainerModule(bind => {
    bind(ElectronWebSocketConnectionProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ElectronWebSocketConnectionProvider);
    bind(WebSocketConnectionProvider).toService(ElectronWebSocketConnectionProvider);
    bind(ElectronLocalWebSocketConnectionProvider).toSelf().inSingletonScope();
    bind(LocalWebSocketConnectionProvider).toDynamicValue(ctx => {
        const localPort = getLocalPort();
        if (localPort) {
            // Return new web socket provider that connects to local app
            return ctx.container.get(ElectronLocalWebSocketConnectionProvider);
        } else {
            // Return the usual web socket provider that already established its connection
            // That way we don't create a second socket connection
            return ctx.container.get(WebSocketConnectionProvider);
        }
    }).inSingletonScope();
    bind(ElectronIpcConnectionProvider).toSelf().inSingletonScope();
});
