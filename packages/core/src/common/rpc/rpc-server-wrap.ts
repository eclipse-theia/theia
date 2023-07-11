// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { RpcContextImpl } from './rpc-context';
// eslint-disable-next-line max-len
import { CancellationToken, CancellationTokenSource, ChannelHandler, PostMessage, RpcCancelMessage, RpcContext, RpcEvent, RpcNotificationMessage, RpcRequestMessage, RpcServer, THEIA_RPC_CHANNELS as ipc, iterPrototypes } from '../../common';

export interface PortEvent {
    port: PostMessage
    sender: unknown
}

/**
 * Reflect on {@link RpcServer} instances and setup wiring to do RPC.
 */
export class RpcServerWrap {

    protected readonly ports = new Map<unknown, Set<PostMessage>>();
    protected readonly requests = new Map<unknown, CancellationTokenSource>();

    constructor(
        protected readonly rpcServer: Record<string | symbol, unknown>,
        protected readonly channels: ChannelHandler<PortEvent>,
        protected readonly contributeBindings: (bindings: Map<string | symbol, unknown>, sender: unknown) => void
    ) {
        this.channels.on(ipc.cancel, this.handleCancelMessage, this);
        this.channels.on(ipc.request, this.handleRequestMessage, this);
        this.channels.on(ipc.notification, this.handleNotificationMessage, this);
        this.forwardEvents(this.rpcServer);
    }

    /**
     * Synchronously call `method` with `params`.
     *
     * `sender` is used to create the {@link RpcContext} passed to the method.
     */
    callMethod(sender: unknown, method: string, params: unknown[] = []): unknown {
        const $method = this.toRpcMethodName(method);
        const ctx = this.createRpcContext(sender);
        return (this.rpcServer[$method] as CallableFunction)(ctx, ...params);
    }

    handleMessage(sender: unknown, port: PostMessage, message: unknown): void {
        this.channels.handleMessage(message, { port, sender });
    }

    registerPort(sender: unknown, port: PostMessage): void {
        let ports = this.ports.get(sender);
        if (!ports) {
            this.ports.set(sender, ports = new Set());
        }
        ports.add(port);
    }

    unregisterPort(sender: unknown, port: PostMessage): void {
        const ports = this.ports.get(sender);
        if (ports?.delete(port) && ports.size === 0) {
            this.ports.delete(sender);
        }
    }

    protected forwardEvents(rpcServer: Record<string, unknown>): void {
        this.collectEvents(rpcServer).forEach($eventName => {
            const rpcEvent = rpcServer[$eventName];
            if (RpcEvent.is(rpcEvent)) {
                rpcEvent.onSendAll(event => this.sendAll($eventName, event));
                rpcEvent.onSendTo(event => this.sendTo($eventName, event));
            }
        });
    }

    protected collectEvents(rpcServer: Record<string, unknown>): Set<string> {
        const events = new Set<string>();
        function collect(value: object): void {
            Object.getOwnPropertyNames(value).forEach(name => {
                if (typeof name === 'string' && name.startsWith('$on')) {
                    events.add(name);
                }
            });
        }
        collect(rpcServer);
        for (const prototype of iterPrototypes(rpcServer)) {
            collect(prototype);
        }
        return events;
    }

    protected sendAll(eventName: string, event: RpcEvent.SendAllEvent<unknown>): void {
        const notification: RpcNotificationMessage = { method: eventName };
        if (event.value !== undefined) {
            notification.params = [event.value];
        }
        const message = this.channels.createMessage(ipc.notification, notification);
        this.ports.forEach((ports, sender) => {
            if (!event.exceptions?.includes(sender)) {
                ports.forEach(port => port.postMessage(message));
            }
        });
    }

    protected sendTo(eventName: string, event: RpcEvent.SendToEvent<unknown>): void {
        const notification: RpcNotificationMessage = { method: eventName };
        if (event.value !== undefined) {
            notification.params = [event.value];
        }
        const message = this.channels.createMessage(ipc.notification, notification);
        new Set(event.targets).forEach(target => {
            this.ports.get(target)?.forEach(port => port.postMessage(message));
        });
    }

    protected handleCancelMessage(event: PortEvent, { requestId }: RpcCancelMessage): void {
        this.requests.get(requestId)?.cancel();
    }

    protected async handleNotificationMessage(event: PortEvent, { method, params = [] }: RpcNotificationMessage): Promise<void> {
        const $method = this.toRpcMethodName(method);
        if (typeof this.rpcServer[$method] !== 'function') {
            console.error(new TypeError(`no callable method named "${method}"`));
            return;
        }
        const ctx = this.createRpcContext(event.sender);
        try {
            await (this.rpcServer[$method] as CallableFunction)(ctx, ...params);
        } catch (error) {
            console.error(error);
        }
    }

    protected async handleRequestMessage({ port, sender }: PortEvent, { method, requestId, params = [] }: RpcRequestMessage): Promise<void> {
        const $method = this.toRpcMethodName(method);
        if (typeof this.rpcServer[$method] !== 'function') {
            const error = new TypeError(`no callable method named "${$method}"`);
            port.postMessage(this.channels.createMessage(ipc.response, { requestId, error }));
            console.error(error);
            return;
        }
        const source = new CancellationTokenSource();
        this.requests.set(requestId, source);
        const ctx = this.createRpcContext(sender, source.token);
        try {
            const result = await (this.rpcServer[$method] as CallableFunction)(ctx, ...params);
            port.postMessage(this.channels.createMessage(ipc.response, { requestId, result }));
        } catch (error) {
            port.postMessage(this.channels.createMessage(ipc.response, { requestId, error }));
            console.error(error);
        } finally {
            this.requests.delete(requestId);
        }
    }

    protected createRpcContext(sender: unknown, cancel?: CancellationToken): RpcContext {
        const bindings = new Map<string | symbol, unknown>();
        this.contributeBindings(bindings, sender);
        return new RpcContextImpl(bindings, sender, cancel);
    }

    protected toRpcMethodName(method: string): `$${string}` {
        if (!method.startsWith('$')) {
            method = '$' + method;
        }
        return method as `$${string}`;
    }
}
