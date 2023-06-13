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

import { ipcMain, IpcMainEvent, WebContents, webContents as electronWebContents, MessagePortMain } from '@theia/electron/shared/electron';
import { inject, injectable, postConstruct } from 'inversify';
import { ChannelDescriptor, Disposable, Emitter } from '../common';
import { Deferred } from '../common/promise-util';
import { AnyFunction, ELECTRON_INVOKE_IPC as ipc, FunctionUtils, IpcEvent, TheiaIpcMain, TheiaIpcMainEvent } from '../electron-common';

@injectable()
export class TheiaIpcMainImpl implements TheiaIpcMain {

    protected ipcMain = ipcMain;
    protected invokeId = 0;
    protected pendingInvokeResults = new Map<string, Deferred<unknown>>();

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

    @postConstruct()
    protected postConstruct(): void {
        (this as TheiaIpcMain).on(ipc.invokeResponse, this.onInvokeResponse, this);
    }

    createEvent(channel: ChannelDescriptor<(event: any) => void>): IpcEvent<any> & Disposable {
        const emitter = new Emitter();
        const channelListener = (event: TheiaIpcMainEvent, arg: any) => emitter.fire(arg);
        const ipcEvent: IpcEvent<any> = listener => emitter.event(listener);
        const dispose = () => {
            this.ipcMain.removeListener(channel.channel, channelListener);
            emitter.dispose();
        };
        this.ipcMain.on(channel.channel, channelListener);
        return Object.assign(ipcEvent, { dispose });
    }

    invoke(webContents: WebContents, channel: ChannelDescriptor, ...args: any[]): any {
        const pending = new Deferred();
        const invokeId = this.invokeId++;
        this.pendingInvokeResults.set(`${channel.channel}-${webContents.id}-${invokeId}`, pending);
        webContents.send(ipc.invokeRequest.channel, channel.channel, invokeId, args);
        return pending.promise;
    }

    handle(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): void {
        this.ipcMain.handle(channel.channel, this.futils.bindfn(listener, thisArg));
    }

    handleOnce(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): void {
        this.ipcMain.handleOnce(channel.channel, this.futils.bindfn(listener, thisArg));
    }

    on(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): this {
        const boundListener = this.futils.bindfn(listener, thisArg);
        const boundMap = this.futils.bindfn(this.mapSyncHandler, this);
        this.ipcMain.on(channel.channel, this.futils.mapfn(boundListener, boundMap));
        return this;
    }

    once(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): this {
        const boundListener = this.futils.bindfn(listener, thisArg);
        const boundMap = this.futils.bindfn(this.mapSyncHandler, this);
        this.ipcMain.once(channel.channel, this.futils.mapfn(boundListener, boundMap));
        return this;
    }

    postMessageTo(webContents: WebContents, channel: ChannelDescriptor, message: any, transfer?: MessagePortMain[]): void {
        webContents.postMessage(channel.channel, message, transfer);
    }

    removeAllListeners(channel: ChannelDescriptor): this {
        this.ipcMain.removeAllListeners(channel.channel);
        return this;
    }

    removeHandler(channel: ChannelDescriptor): void {
        this.ipcMain.removeHandler(channel.channel);
    }

    removeListener(channel: ChannelDescriptor, listener: AnyFunction, thisArg?: object): this {
        this.ipcMain.removeListener(channel.channel, this.futils.bindfn(listener, thisArg));
        return this;
    }

    sendAll(channel: ChannelDescriptor, ...args: any[]): void {
        electronWebContents.getAllWebContents().forEach(webContents => {
            this.sendTo(webContents, channel, ...args);
        });
    }

    sendTo(webContents: WebContents, channel: ChannelDescriptor, ...args: any[]): void {
        webContents.send(channel.channel, ...args);
    }

    protected onInvokeResponse(event: IpcMainEvent, invokeChannel: string, invokeId: number, error: unknown, result: unknown): void {
        const key = `${invokeChannel}-${event.sender.id}-${invokeId}`;
        const pending = this.pendingInvokeResults.get(key);
        if (pending) {
            this.pendingInvokeResults.delete(key);
            if (error) {
                pending.reject(error);
            } else {
                pending.resolve(result);
            }
        } else {
            console.warn(`no pending request for: "${key}"`);
        }
    }

    /**
     * Use the return value from `callbackfn` to set `event.returnValue`.
     */
    protected mapSyncHandler(callbackfn: (event: TheiaIpcMainEvent, ...args: unknown[]) => unknown): (event: TheiaIpcMainEvent, ...args: unknown[]) => void {
        return (event, ...args) => {
            const result = callbackfn(event, ...args);
            if (result !== undefined) {
                event.returnValue = result;
            }
        };
    }
}
