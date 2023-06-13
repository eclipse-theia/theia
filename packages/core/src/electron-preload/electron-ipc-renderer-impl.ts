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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ipcRenderer, IpcRendererEvent } from '@theia/electron/shared/electron';
import { inject, injectable, postConstruct } from 'inversify';
import { ChannelDescriptor, Disposable, Emitter } from '../common';
import { AnyFunction, FunctionUtils, TheiaIpcRenderer, ELECTRON_INVOKE_IPC as ipc, IpcEvent, TheiaIpcRendererEvent } from '../electron-common';

@injectable()
export class TheiaIpcRendererImpl implements TheiaIpcRenderer {

    protected ipcRenderer = ipcRenderer;
    protected handleListeners = new Map<string, { handler: AnyFunction, once: boolean }>();

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

    @postConstruct()
    protected postConstruct(): void {
        (this as TheiaIpcRenderer).on(ipc.invokeRequest, this.onInvokeRequest, this);
    }

    createEvent(channel: ChannelDescriptor<(event: any) => void>): IpcEvent<any> & Disposable {
        const emitter = new Emitter();
        const channelListener = (event: TheiaIpcRendererEvent, arg: any) => emitter.fire(arg);
        const ipcEvent: IpcEvent<any> = listener => emitter.event(listener);
        const dispose = () => {
            this.ipcRenderer.removeListener(channel.channel, channelListener);
            emitter.dispose();
        };
        this.ipcRenderer.on(channel.channel, channelListener);
        return Object.assign(ipcEvent, { dispose });
    }

    invoke(channel: ChannelDescriptor, ...args: any[]): any {
        return this.ipcRenderer.invoke(channel.channel, ...args);
    }

    handle(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): void {
        if (this.handleListeners.has(channel.channel)) {
            console.warn(`replacing the handler for: "${channel.channel}"`);
        }
        this.handleListeners.set(channel.channel, { handler: this.futils.bindfn(listener, thisArg), once: false });
    }

    handleOnce(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): void {
        if (this.handleListeners.has(channel.channel)) {
            console.warn(`replacing the handler for: "${channel.channel}"`);
        }
        this.handleListeners.set(channel.channel, { handler: this.futils.bindfn(listener, thisArg), once: true });
    }

    on(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): this {
        this.ipcRenderer.on(channel.channel, this.futils.bindfn(listener, thisArg));
        return this;
    }

    once(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): this {
        this.ipcRenderer.once(channel.channel, this.futils.bindfn(listener, thisArg));
        return this;
    }

    postMessage(channel: ChannelDescriptor, message: any, transfer?: MessagePort[]): void {
        this.ipcRenderer.postMessage(channel.channel, message, transfer);
    }

    removeAllListeners(channel: ChannelDescriptor): this {
        this.ipcRenderer.removeAllListeners(channel.channel);
        return this;
    }

    removeListener(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): this {
        this.ipcRenderer.removeListener(channel.channel, this.futils.bindfn(listener, thisArg));
        return this;
    }

    send(channel: ChannelDescriptor, ...args: any[]): void {
        this.ipcRenderer.send(channel.channel, ...args);
    }

    sendSync(channel: ChannelDescriptor, ...args: any[]): any {
        return this.ipcRenderer.sendSync(channel.channel, ...args);
    }

    sendTo(webContentsId: number, channel: ChannelDescriptor, ...args: any[]): void {
        this.ipcRenderer.sendTo(webContentsId, channel.channel, ...args);
    }

    sendToHost(channel: ChannelDescriptor, ...args: any[]): void {
        this.ipcRenderer.sendToHost(channel.channel, ...args);
    }

    protected onInvokeRequest(event: IpcRendererEvent, invokeChannel: string, invokeId: number, args: any[]): void {
        const handle = this.handleListeners.get(invokeChannel);
        if (!handle) {
            const error = new Error(`no handler for: "${invokeChannel}"`);
            console.error(error);
            event.sender.send(ipc.invokeResponse.channel, invokeChannel, invokeId, error);
            return;
        }
        if (handle.once) {
            this.handleListeners.delete(invokeChannel);
        }
        Promise.resolve(handle.handler(...args)).then(
            response => {
                event.sender.send(ipc.invokeResponse.channel, invokeChannel, invokeId, undefined, response);
            },
            error => {
                console.error(error);
                event.sender.send(ipc.invokeResponse.channel, invokeChannel, invokeId, error);
            }
        );
    }
}
