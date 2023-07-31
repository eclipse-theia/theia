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

import type { IpcMainEvent, IpcMainInvokeEvent, MessagePortMain, WebContents } from '@theia/electron/shared/electron';
import type { interfaces } from 'inversify';
import type { AnyFunction, ChannelDescriptor, Listener } from '../../common';

export type TheiaIpcMainInvokeEvent = IpcMainInvokeEvent;
export type TheiaIpcMainEvent = IpcMainEvent;

/**
 * Wrapper around Electron's {@link IpcMain} API to handle typed {@link ChannelDescriptor}s.
 *
 * This component is only available in the Electron main context.
 */
export const TheiaIpcMain = Symbol('TheiaIpcMain') as symbol & interfaces.Abstract<TheiaIpcMain>;
export interface TheiaIpcMain {
    handle<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcMainInvokeEvent, T>, thisArg?: object): void
    handleOnce<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcMainInvokeEvent, T>, thisArg?: object): void
    /**
     * Handle a call to `send` or `sendSync` from a window.
     *
     * Note that you DON'T need to set `event.returnValue`, just returning the
     * value in your handler is enough.
     */
    on<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcMainEvent, T>, thisArg?: object): this
    /**
     * Only handle once a call to `send` or `sendSync`from a window.
     *
     * Note that you DON'T need to set `event.returnValue`, just returning the
     * value in your handler is enough.
     */
    once<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcMainEvent, T>, thisArg?: object): this
    postMessageTo<M>(webContents: WebContents, channel: ChannelDescriptor<(message: M) => void>, message: M, transfer?: readonly MessagePortMain[]): void
    removeAllListeners(channel: ChannelDescriptor): this
    removeHandler(channel: ChannelDescriptor): void
    removeListener<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcMainEvent, T>, thisArg?: object): this
    sendAll<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
    sendTo<T extends AnyFunction>(webContents: WebContents, channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
}
