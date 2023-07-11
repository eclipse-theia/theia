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

import { ipcRenderer } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { AnyFunction, ChannelDescriptor, FunctionUtils } from '../common';
import { TheiaIpcRenderer } from './ipc-renderer';

@injectable()
export class TheiaIpcRendererImpl implements TheiaIpcRenderer {

    protected ipcRenderer = ipcRenderer;

    @inject(FunctionUtils)
    protected futils: FunctionUtils;

    invoke(channel: ChannelDescriptor, ...args: any[]): any {
        return this.ipcRenderer.invoke(channel.channel, ...args);
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
}
