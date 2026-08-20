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
import { injectable, inject, named } from 'inversify';
import { ServiceConnectionProvider } from '../../browser/messaging/service-connection-provider';
import { ILogger } from '../../common/logger';
import { ConnectionSource } from '../../browser/messaging/connection-source';

@injectable()
export class FrontendOnlyConnectionSource implements ConnectionSource {
    onConnectionDidOpen = new Emitter<Channel>().event;
}

/**
 * Proxy factory for services without a frontend-only implementation. There is no backend,
 * so no channel will ever open and requests would otherwise be queued forever, blocking
 * any caller that awaits the result, e.g. during application startup.
 * Instead, requests fail immediately and notifications (fire-and-forget) resolve silently.
 */
export class FrontendOnlyRpcProxyFactory<T extends object> extends RpcProxyFactory<T> {

    constructor(protected readonly path: string, target?: object) {
        super(target);
    }

    override get(target: T, p: PropertyKey, receiver: unknown): unknown {
        if (typeof p !== 'string') {
            return undefined;
        }
        // members handled by the base proxy without a connection
        if (['setClient', 'getClient', 'onDidOpenConnection', 'onDidCloseConnection', 'then', 'toJSON'].includes(p)) {
            return super.get(target, p, receiver);
        }
        if (this.isNotification(p)) {
            return () => Promise.resolve();
        }
        return () => Promise.reject(new Error(`Request '${p}' on service '${this.path}' is unavailable: no backend in frontend-only mode.`));
    }
}

@injectable()
export class FrontendOnlyServiceConnectionProvider extends ServiceConnectionProvider {

    @inject(ILogger) @named('core:FrontendOnlyServiceConnectionProvider')
    protected readonly logger: ILogger;

    onSocketDidOpen = Event.None;
    onSocketDidClose = Event.None;
    onIncomingMessageActivity = Event.None;
    override createProxy<T extends object>(path: string, target?: object): RpcProxy<T> {
        this.logger.debug(`[Frontend-Only Fallback] Created proxy connection for ${path}`);
        if (target instanceof RpcProxyFactory) {
            return target.createProxy();
        }
        return new FrontendOnlyRpcProxyFactory<T>(path, target).createProxy();
    }
    override listen(path: string, handler: ServiceConnectionProvider.ConnectionHandler, reconnect: boolean): void {
        this.logger.debug('[Frontend-Only Fallback] Listen to websocket connection requested');
    }
}
