// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable, interfaces, postConstruct } from 'inversify';
import { Channel, RpcProxy, RpcProxyFactory } from '../../common';
import { ChannelMultiplexer } from '../../common/message-rpc/channel';
import { Deferred } from '../../common/promise-util';
import { ConnectionSource } from './connection-source';

export const LocalConnectionProvider = Symbol('LocalConnectionProvider');
export const RemoteConnectionProvider = Symbol('RemoteConnectionProvider');

export namespace ServiceConnectionProvider {
    export type ConnectionHandler = (path: String, channel: Channel) => void;
}

/**
 * This class manages the channels for remote services in the back end
 */
@injectable()
export class ServiceConnectionProvider {

    static createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): RpcProxy<T> {
        return container.get<ServiceConnectionProvider>(RemoteConnectionProvider).createProxy(path, arg);
    }

    static createLocalProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): RpcProxy<T> {
        return container.get<ServiceConnectionProvider>(LocalConnectionProvider).createProxy(path, arg);
    }

    static createHandler(container: interfaces.Container, path: string, arg?: object): void {
        const remote = container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const local = container.get<ServiceConnectionProvider>(LocalConnectionProvider);
        remote.createProxy(path, arg);
        if (remote !== local) {
            local.createProxy(path, arg);
        }
    }

    protected readonly channelHandlers = new Map<string, ServiceConnectionProvider.ConnectionHandler>();

    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path and proxy factory.
     */
    createProxy<T extends object>(path: string, factory: RpcProxyFactory<T>): RpcProxy<T>;
    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    createProxy<T extends object>(path: string, target?: object): RpcProxy<T>;
    createProxy<T extends object>(path: string, arg?: object): RpcProxy<T> {
        const factory = arg instanceof RpcProxyFactory ? arg : new RpcProxyFactory<T>(arg);
        this.listen(path, (_, c) => factory.listen(c), true);
        return factory.createProxy();
    }

    protected channelMultiplexer: ChannelMultiplexer;

    private channelReadyDeferred = new Deferred<void>();
    protected get channelReady(): Promise<void> {
        return this.channelReadyDeferred.promise;
    }

    @postConstruct()
    init(): void {
        this.connectionSource.onConnectionDidOpen(channel => this.handleChannelCreated(channel));
    }

    @inject(ConnectionSource)
    protected connectionSource: ConnectionSource;

    /**
     * This method must be invoked by subclasses when they have created the main channel.
     * @param mainChannel
     */
    protected handleChannelCreated(channel: Channel): void {
        channel.onClose(() => {
            this.handleChannelClosed(channel);
        });

        this.channelMultiplexer = new ChannelMultiplexer(channel);
        this.channelReadyDeferred.resolve();
        for (const entry of this.channelHandlers.entries()) {
            this.openChannel(entry[0], entry[1]);
        }
    }

    handleChannelClosed(channel: Channel): void {
        this.channelReadyDeferred = new Deferred();
    }

    /**
     * Install a connection handler for the given path.
     */
    listen(path: string, handler: ServiceConnectionProvider.ConnectionHandler, reconnect: boolean): void {
        this.openChannel(path, handler).then(() => {
            if (reconnect) {
                this.channelHandlers.set(path, handler);
            }
        });

    }

    private async openChannel(path: string, handler: ServiceConnectionProvider.ConnectionHandler): Promise<void> {
        await this.channelReady;
        const newChannel = await this.channelMultiplexer.open(path);
        handler(path, newChannel);
    }
}
