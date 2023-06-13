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

/* eslint-disable max-len */

import { MessagePortMain, WebContents } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { CancellationToken, CancellationTokenSource, ChannelHandler, ChannelHandlerFactory, iterPrototypes, RpcContext, RpcContextEvent, RpcContextKey, RpcEvent, RpcServerProvider } from '../../common';
import { ELECTRON_MAIN_RPC_IPC as rpc, RpcCancelMessage, RpcCreateMessage, RpcNotificationMessage, RpcPortForwardMessage, RpcRequestMessage, RpcRequestSyncMessage, TheiaIpcMain } from '../../electron-common';
import { TheiaIpcMainEvent } from '../../electron-common/messaging/electron-ipc';
import { ElectronMainApplicationContribution } from '../electron-main-application';
import { SenderWebContents } from '../electron-main-rpc-context';

export interface PortEvent {
    port: MessagePortMain
    sender: WebContents
}

export interface RpcHandler {
    call(sender: WebContents, method: string, params?: unknown): unknown;
    listen(sender: WebContents, port: MessagePortMain): void;
}

export class ToSender<T = void> extends RpcContextEvent<T> {
    constructor(readonly sender: WebContents, value: T) {
        super(value);
    }
}

@injectable()
export class ElectronMainRpcImpl implements ElectronMainApplicationContribution {

    protected proxyId = 0;
    protected proxies = new Map<unknown, RpcHandler>();

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    @inject(ChannelHandlerFactory)
    protected channelHandlerFactory: ChannelHandlerFactory;

    @inject(RpcServerProvider)
    protected rpcServerProvider: RpcServerProvider;

    onStart(): void {
        this.ipcMain.on(rpc.create, this.handleCreateSync, this);
        this.ipcMain.on(rpc.requestSync, this.handleRequestSync, this);
        this.ipcMain.on(rpc.portForward, this.handlePortForward, this);
    }

    protected handleCreateSync(event: TheiaIpcMainEvent, { proxyPath }: RpcCreateMessage): void {
        const server = this.rpcServerProvider(proxyPath);
        const proxyId = this.proxyId++;
        const rpcHandler = new RpcHandlerImpl(server, this.channelHandlerFactory());
        this.proxies.set(proxyId, rpcHandler);
        event.returnValue = proxyId;
    }

    protected handleRequestSync(event: TheiaIpcMainEvent, { proxyId, method, params }: RpcRequestSyncMessage): void {
        const proxy = this.proxies.get(proxyId);
        if (!proxy) {
            throw new Error(`unknown proxy: "${proxyId}"`);
        }
        event.returnValue = proxy.call(event.sender, method, params);
    }

    protected handlePortForward(event: TheiaIpcMainEvent, { proxyId }: RpcPortForwardMessage): void {
        const proxy = this.proxies.get(proxyId);
        if (!proxy) {
            event.ports.forEach(port => port.close());
            throw new Error(`unknown proxy: "${proxyId}"`);
        }
        proxy.listen(event.sender, event.ports[0]);
    }
}

export class RpcHandlerImpl implements RpcHandler {

    protected ports = new Map<WebContents, Set<MessagePortMain>>();
    protected requests = new Map<unknown, CancellationTokenSource>();

    constructor(
        protected rpcServer: Record<string, unknown>,
        protected channels: ChannelHandler<PortEvent>
    ) {
        this.channels.on(rpc.cancel, this.handleCancelMessage, this);
        this.channels.on(rpc.request, this.handleRequestMessage, this);
        this.channels.on(rpc.notification, this.handleNotificationMessage, this);
        this.forwardEvents(this.rpcServer);
    }

    call(sender: WebContents, method: string, params: unknown[] = []): unknown {
        const $method = this.toRpcMethodName(method);
        const ctx = this.createRpcContext(sender);
        return (this.rpcServer[$method] as CallableFunction)(ctx, ...params);
    }

    listen(sender: WebContents, port: MessagePortMain): void {
        this.getPortsFrom(sender).add(port);
        port.on('message', event => this.channels.handleMessage(event.data, { port, sender }));
        port.on('close', () => {
            port.removeAllListeners();
            this.ports.get(sender)?.delete(port);
        });
        port.start();
    }

    protected getPortsFrom(sender: WebContents): Set<MessagePortMain> {
        let ports = this.ports.get(sender);
        if (!ports) {
            this.ports.set(sender, ports = new Set());
            sender.once('destroyed', () => this.ports.delete(sender));
        }
        return ports;
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
        const message = this.channels.createMessage(rpc.notification, notification);
        this.ports.forEach((ports, sender) => {
            if (!event.exceptions || !event.exceptions.includes(sender)) {
                ports.forEach(port => port.postMessage(message));
            }
        });
    }

    protected sendTo(eventName: string, event: RpcEvent.SendToEvent<unknown>): void {
        const notification: RpcNotificationMessage = { method: eventName };
        if (event.value !== undefined) {
            notification.params = [event.value];
        }
        const message = this.channels.createMessage(rpc.notification, notification);
        event.targets.forEach(target => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.ports.get(target as any)?.forEach(port => port.postMessage(message));
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
        };
        const ctx = this.createRpcContext(event.sender);
        try {
            await (this.rpcServer[$method] as CallableFunction)(ctx, ...params);
        } catch (error) {
            console.error(error);
        }
    }

    protected async handleRequestMessage(event: PortEvent, { method, requestId, params = [] }: RpcRequestMessage): Promise<void> {
        const $method = this.toRpcMethodName(method);
        if (typeof this.rpcServer[$method] !== 'function') {
            const error = new TypeError(`no callable method named "${method}"`);
            event.port.postMessage(this.channels.createMessage(rpc.response, { requestId, error }));
            console.error(error);
            return;
        };
        const source = new CancellationTokenSource();
        this.requests.set(requestId, source);
        const ctx = this.createRpcContext(event.sender, source.token);
        try {
            const result = await (this.rpcServer[$method] as CallableFunction)(ctx, ...params);
            event.port.postMessage(this.channels.createMessage(rpc.response, { requestId, result }));
        } catch (error) {
            event.port.postMessage(this.channels.createMessage(rpc.response, { requestId, error }));
            console.error(error);
        } finally {
            this.requests.delete(requestId);
        }
    }

    protected createRpcContext(sender: WebContents, cancel?: CancellationToken): RpcContext {
        return new ElectronMainRpcContext(sender, new Map().set(SenderWebContents, sender), cancel);
    }

    protected toRpcMethodName(method: string): `$${string}` {
        if (!method.startsWith('$')) {
            method = '$' + method;
        }
        return method as `$${string}`;
    }
}

export class ElectronMainRpcContext implements RpcContext {

    #bindings: Map<string | symbol, unknown>;

    constructor(
        readonly sender: WebContents,
        bindings: Map<string | symbol, unknown>,
        readonly request?: CancellationToken
    ) {
        this.#bindings = bindings;
    }

    get<T>(key: RpcContextKey<T>): T | undefined {
        return this.#bindings.get(key) as T | undefined;
    }

    require<T>(key: RpcContextKey<T>): T {
        if (!this.#bindings.has(key)) {
            throw new Error(`no value for context key: ${key.toString()}`);
        }
        return this.#bindings.get(key) as T;
    }
}
