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

import type { IpcRenderer, IpcRendererEvent } from '@theia/electron/shared/electron';
import type { interfaces } from 'inversify';
import type { AnyFunction, ChannelDescriptor, Listener, ToPromise } from '../common';

export type TheiaIpcRendererEvent = IpcRendererEvent;
/** Reserved for future uses. */
export interface TheiaIpcRendererInvokeEvent { }

/**
 * Wrapper around Electron's {@link IpcRenderer} API to handle typed {@link ChannelDescriptor}s.
 *
 * This component is only available in the Electron preload context.
 */
export const TheiaIpcRenderer = Symbol('TheiaIpcRenderer') as symbol & interfaces.Abstract<TheiaIpcRenderer>;
export interface TheiaIpcRenderer {
    invoke<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): ToPromise<ReturnType<T>>;
    on<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcRendererEvent, T>, thisArg?: object): this
    once<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcRendererEvent, T>, thisArg?: object): this
    postMessage<M>(channel: ChannelDescriptor<(message: M) => void>, message: M, transfer?: readonly MessagePort[]): void
    removeAllListeners(channel: ChannelDescriptor): this
    removeListener<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<TheiaIpcRendererEvent, T>, thisArg?: object): this
    send<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
    sendSync<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): ReturnType<T>
    sendTo<T extends AnyFunction>(webContentsId: number, channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
    sendToHost<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
}
