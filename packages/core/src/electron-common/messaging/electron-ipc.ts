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

import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent, IpcRenderer, IpcRendererEvent, MessagePortMain, WebContents } from '@theia/electron/shared/electron';
import type { interfaces } from 'inversify';
import type { ChannelDescriptor, Disposable, MaybePromise } from '../../common';

/* eslint-disable @typescript-eslint/no-explicit-any, no-null/no-null, space-before-function-paren */

type AnyFunction = (...params: any[]) => any;

type NamespaceTemplate = Record<string, PlaceHolderIpcChannel<any>>;
type NamespaceFromTemplate<T extends NamespaceTemplate> = {
    [K in keyof T]: K extends string ? T[K] extends PlaceHolderIpcChannel<infer U> ? ChannelDescriptor<U> : never : never
};

const namespaces = new Set<string>();

export type TheiaIpcMainInvokeEvent = IpcMainInvokeEvent;
export type TheiaIpcMainEvent = IpcMainEvent;
export type TheiaIpcRendererEvent = IpcRendererEvent;
/** Reserved for future uses. */
export interface TheiaIpcRendererInvokeEvent { }

/**
 * Attach callbacks to this event to receive notifications.
 *
 * This type is a simplified version of Theia core's `Event` in order to work
 * properly when used across Electron's contexts.
 */
export type IpcEvent<T> = (listener: (event: T) => void) => Disposable;
export type IpcListener<T, U extends AnyFunction> = (event: T, ...params: Parameters<U>) => ReturnType<U>;
export type IpcInvokeReturn<T extends AnyFunction> = ReturnType<T> extends MaybePromise<infer U> ? Promise<U> : never;

export const TheiaIpcMain = Symbol('TheiaIpcMain') as symbol & interfaces.Abstract<TheiaIpcMain>;
/**
 * Wrapper around Electron's {@link IpcMain} API to handle typed {@link ChannelDescriptor}s.
 *
 * This component is only available in the Electron main context.
 */
export interface TheiaIpcMain {
    /**
     * Create an {@link IpcEvent} that will fire whenever a message is received
     * on {@link channel}.
     */
    createEvent<T>(channel: ChannelDescriptor<(event: T) => void>): IpcEvent<T> & Disposable
    /**
     * Invoke a handler and get a response from a given webContents.
     *
     * This functionality is not natively supported by Electron, so this relies
     * on a custom message protocol.
     */
    invoke<T extends AnyFunction>(webContents: WebContents, channel: ChannelDescriptor<T>, ...params: Parameters<T>): IpcInvokeReturn<T>
    handle<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcMainInvokeEvent, T>, thisArg?: object): void
    handleOnce<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcMainInvokeEvent, T>, thisArg?: object): void
    /**
     * Handle a call to `send` or `sendSync` from a window.
     *
     * Note that you DON'T need to set `event.returnValue`, just returning the
     * value in your handler is enough.
     */
    on<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcMainEvent, T>, thisArg?: object): this
    /**
     * Only handle once a call to `send` or `sendSync`from a window.
     *
     * Note that you DON'T need to set `event.returnValue`, just returning the
     * value in your handler is enough.
     */
    once<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcMainEvent, T>, thisArg?: object): this
    postMessageTo<M>(webContents: WebContents, channel: ChannelDescriptor<(message: M) => void>, message: M, transfer?: readonly MessagePortMain[]): void
    removeAllListeners(channel: ChannelDescriptor): this
    removeHandler(channel: ChannelDescriptor): void
    removeListener<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcMainEvent, T>, thisArg?: object): this
    sendAll<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
    sendTo<T extends AnyFunction>(webContents: WebContents, channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
}

export const TheiaIpcRenderer = Symbol('TheiaIpcRenderer') as symbol & interfaces.Abstract<TheiaIpcRenderer>;
/**
 * Wrapper around Electron's {@link IpcRenderer} API to handle typed {@link ChannelDescriptor}s.
 *
 * This component is only available in the Electron preload context.
 */
export interface TheiaIpcRenderer {
    /**
     * Create an {@link IpcEvent} that will fire whenever a message is received
     * on {@link channel}.
     */
    createEvent<T>(channel: ChannelDescriptor<(event: T) => void>): IpcEvent<T> & Disposable
    invoke<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): IpcInvokeReturn<T>
    /**
     * Handle requests coming from the main context.
     *
     * This functionality is not natively supported by Electron, so this
     * relies on a custom message protocol.
     */
    handle<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcRendererInvokeEvent, T>, thisArg?: object): void
    /**
     * Handle requests coming from the main context only once.
     *
     * This functionality is not natively supported by Electron, so this
     * relies on a custom message protocol.
     */
    handleOnce<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcRendererInvokeEvent, T>, thisArg?: object): void
    on<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcRendererEvent, T>, thisArg?: object): this
    once<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcRendererEvent, T>, thisArg?: object): this
    postMessage<M>(channel: ChannelDescriptor<(message: M) => void>, message: M, transfer?: readonly MessagePort[]): void
    removeAllListeners(channel: ChannelDescriptor): this
    removeListener<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<TheiaIpcRendererEvent, T>, thisArg?: object): this
    send<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
    sendSync<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): ReturnType<T>
    sendTo<T extends AnyFunction>(webContentsId: number, channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
    sendToHost<T extends AnyFunction>(channel: ChannelDescriptor<T>, ...params: Parameters<T>): void
}

export const TheiaIpcWindow = Symbol('TheiaIpcWindow') as symbol & interfaces.Abstract<TheiaIpcWindow>;
/**
 * {@link postMessage} doesn't support channels by default so this component
 * emulates channels over messages.
 */
export interface TheiaIpcWindow {
    on<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<MessageEvent, T>, thisArg?: object): this
    once<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<MessageEvent, T>, thisArg?: object): this
    postMessage<M>(targetOrigin: string, channel: ChannelDescriptor<(message: M) => void>, message: M, transfer?: readonly MessagePort[]): void
    removeAllListeners(channel: ChannelDescriptor): this
    removeListener<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: IpcListener<MessageEvent, T>, thisArg?: object): this
}

/**
 * Create a single {@link ChannelDescriptor}.
 */
export function createIpcChannel<T extends AnyFunction>(channel: string): ChannelDescriptor<T> {
    return { channel };
}

/**
 * Create namespaced {@link ChannelDescriptor}s.
 *
 * @param namespace String to use to prefix all channels with.
 * @param templateFactory callback returning the object used to build the namespace.
 * @example
 *
 * const MY_NAMESPACE = createIpcNamespace('prefix-for-all-channels', channel => ({
 *     firstChannel: channel<(arg1: string, arg2: number) => void>(),
 *     secondChannel: channel<() => Promise<string>>(),
 *     // ...
 * }));
 *
 * MY_NAMESPACE.firstChannel; // === IpcChannel<(arg1: string, arg2: number) => void>
 * MY_NAMESPACE.firstChannel.channel === 'prefix-for-all-channels.firstChannel';
 */
export function createIpcNamespace<T extends NamespaceTemplate>(
    namespace: string,
    templateFactory: (placeHolderChannelFactory: <U extends AnyFunction>() => PlaceHolderIpcChannel<U>) => T
): NamespaceFromTemplate<T> {
    if (namespaces.has(namespace)) {
        console.warn('already registered ipc channel namespace!', namespace);
    } else {
        namespaces.add(namespace);
    }
    const result: any = Object.create(null);
    for (const name of Object.keys(templateFactory(() => new PlaceHolderIpcChannel()))) {
        result[name] = { channel: `${namespace}.${name}` };
    }
    return result;
}

/**
 * Dud object used to carry type information.
 */
export class PlaceHolderIpcChannel<T extends AnyFunction> { }
