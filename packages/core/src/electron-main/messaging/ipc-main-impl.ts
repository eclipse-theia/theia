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

import { ipcMain, WebContents, webContents as electronWebContents, MessagePortMain } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { AnyFunction, ChannelDescriptor, FunctionUtils } from '../../common';
import { TheiaIpcMain, TheiaIpcMainEvent } from './ipc-main';

@injectable()
export class TheiaIpcMainImpl implements TheiaIpcMain {

    protected ipcMain = ipcMain;

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

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
