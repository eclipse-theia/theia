// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, interfaces, decorate, unmanaged, inject } from 'inversify';
import { RpcProxyFactory, RpcProxy } from '../../common';
import { RemoteConnectionProvider, ServiceConnectionProvider } from './service-connection-provider';

decorate(injectable(), RpcProxyFactory);
decorate(unmanaged(), RpcProxyFactory, 0);

/**
 * @deprecated This class serves to keep API compatibility for a while.
 * Use the {@linkcode RemoteConnectionProvider} as the injection symbol and {@linkcode ServiceConnectionProvider} as the type instead.
 */
@injectable()
export class WebSocketConnectionProvider {
    @inject(RemoteConnectionProvider)
    private readonly remoteConnectionProvider: ServiceConnectionProvider;

    static createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): RpcProxy<T> {
        return ServiceConnectionProvider.createProxy(container, path, arg);
    }

    static createLocalProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): RpcProxy<T> {
        return ServiceConnectionProvider.createLocalProxy(container, path, arg);
    }

    static createHandler(container: interfaces.Container, path: string, arg?: object): void {
        return ServiceConnectionProvider.createHandler(container, path, arg);
    }

    createProxy<T extends object>(path: string, target?: object): RpcProxy<T>;
    createProxy<T extends object>(path: string, factory: RpcProxyFactory<T>): RpcProxy<T> {
        return this.remoteConnectionProvider.createProxy(path, factory);
    }
}
