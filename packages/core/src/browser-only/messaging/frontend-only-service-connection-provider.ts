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
import { Event, RpcProxy, Channel, RpcProxyFactory, Emitter } from '../../common';
import { injectable } from 'inversify';
import { ServiceConnectionProvider } from '../../browser/messaging/service-connection-provider';
import { ConnectionSource } from '../../browser/messaging/connection-source';

@injectable()
export class FrontendOnlyConnectionSource implements ConnectionSource {
    onConnectionDidOpen = new Emitter<Channel>().event;
}

@injectable()
export class FrontendOnlyServiceConnectionProvider extends ServiceConnectionProvider {
    onSocketDidOpen = Event.None;
    onSocketDidClose = Event.None;
    onIncomingMessageActivity = Event.None;
    override createProxy<T extends object>(path: unknown, target?: unknown): RpcProxy<T> {
        console.debug(`[Frontend-Only Fallback] Created proxy connection for ${path}`);
        const factory = target instanceof RpcProxyFactory ? target : new RpcProxyFactory<T>(target);
        return factory.createProxy();
    }
    override listen(path: string, handler: ServiceConnectionProvider.ConnectionHandler, reconnect: boolean): void {
        console.debug('[Frontend-Only Fallback] Listen to websocket connection requested');
    }
}
