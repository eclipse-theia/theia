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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, interfaces } from 'inversify';
import { Emitter, Event } from '../event';
import { ConnectionHandler } from './handler';
import { JsonRpcProxy, JsonRpcProxyFactory } from './proxy-factory';
import { Channel, ChannelMultiplexer } from '../message-rpc/channel';

/**
 * Factor common logic according to `ElectronIpcConnectionProvider` and
 * `WebSocketConnectionProvider`. This class handles channels in a somewhat
 * generic way.
 */
@injectable()
export abstract class AbstractConnectionProvider<AbstractOptions extends object> {

    /**
     * Create a proxy object to remote interface of T type
     * over an electron ipc connection for the given path and proxy factory.
     */
    static createProxy<T extends object>(container: interfaces.Container, path: string, factory: JsonRpcProxyFactory<T>): JsonRpcProxy<T>;
    /**
     * Create a proxy object to remote interface of T type
     * over an electron ipc connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    static createProxy<T extends object>(container: interfaces.Container, path: string, target?: object): JsonRpcProxy<T> {
        throw new Error('abstract');
    }

    protected readonly onIncomingMessageActivityEmitter: Emitter<void> = new Emitter();
    get onIncomingMessageActivity(): Event<void> {
        return this.onIncomingMessageActivityEmitter.event;
    }

    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path and proxy factory.
     */
    createProxy<T extends object>(path: string, factory: JsonRpcProxyFactory<T>): JsonRpcProxy<T>;
    /**
     * Create a proxy object to remote interface of T type
     * over a web socket connection for the given path.
     *
     * An optional target can be provided to handle
     * notifications and requests from a remote side.
     */
    createProxy<T extends object>(path: string, target?: object): JsonRpcProxy<T>;
    createProxy<T extends object>(path: string, arg?: object): JsonRpcProxy<T> {
        const factory = arg instanceof JsonRpcProxyFactory ? arg : new JsonRpcProxyFactory<T>(arg);
        this.listen({
            path,
            onConnection: c => factory.listen(c)
        });
        return factory.createProxy();
    }

    protected channelMultiPlexer: ChannelMultiplexer;

    constructor() {
        this.channelMultiPlexer = this.createMultiplexer();
    }

    protected createMultiplexer(): ChannelMultiplexer {
        return new ChannelMultiplexer(this.createMainChannel());
    }

    /**
     * Install a connection handler for the given path.
     */
    listen(handler: ConnectionHandler, options?: AbstractOptions): void {
        this.openChannel(handler.path, channel => {
            handler.onConnection(channel);
        }, options);
    }

    async openChannel(path: string, handler: (channel: Channel) => void, options?: AbstractOptions): Promise<void> {
        const newChannel = await this.channelMultiPlexer.open(path);
        newChannel.onClose(() => {
            const { reconnecting } = { reconnecting: true, ...options };
            if (reconnecting) {
                this.openChannel(path, handler, options);
            }
        });
        handler(newChannel);
    }

    /**
     * Create the main connection that is used for multiplexing all channels.
     */
    protected abstract createMainChannel(): Channel;

}
