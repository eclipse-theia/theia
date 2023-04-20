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

import { interfaces } from 'inversify';
import { MaybePromise } from '../common';
import { createIpcNamespace, TheiaIpcMainEvent } from './electron-ipc';

/**
 * @internal
 */
export type ConnectionRequest = [requestId: number, handlerId: string, handlerParams: any[]];
/**
 * @internal
 */
export type ConnectionResponse = [requestId: number, error?: any];

/**
 * @internal
 */
export const ELECTRON_MESSAGE_PORT_IPC = createIpcNamespace('theia-electron-message-port', channel => ({
    connectionRequest: channel<(message: ConnectionRequest) => void>(),
    connectionResponse: channel<(message: ConnectionResponse) => void>()
}));

/**
 * @internal
 *
 * Typed identifier for a specific message port handler.
 */
export type MessagePortHandlerId<T extends any[] = any> = string & { __static: T };
export function MessagePortHandlerId<T extends any[]>(handleId: string): MessagePortHandlerId<T> {
    return handleId as any;
}

/**
 * @internal
 *
 * Typed message port handler function.
 */
export type MessagePortHandler<T extends any[] = any> = (event: TheiaIpcMainEvent, ...params: T) => MaybePromise<void>;

/**
 * @internal
 *
 * Handle message port requests.
 */
export const MessagePortServer = Symbol('MessagePortServer') as symbol & interfaces.Abstract<MessagePortServer>;
export interface MessagePortServer {
    handle<T extends any[]>(handlerId: MessagePortHandlerId<T>, handler: MessagePortHandler<T>, thisArg?: object): void
    removeHandler(handlerId: MessagePortHandlerId): void
}

/**
 * @internal
 *
 * Establish message port connections given some handler identifier.
 */
export const MessagePortClient = Symbol('MessagePortClient') as symbol & interfaces.Abstract<MessagePortClient>;
export interface MessagePortClient {
    /**
     * Open a connection with a handler located in Electron's main context.
     *
     * Don't forget to call {@link MessagePort.start}.
     */
    connect<T extends any[]>(handlerId: string | MessagePortHandlerId<T>, ...params: T): Promise<MessagePort>
    /**
     * Open a connection with a handler located in Electron's main context.
     *
     * Don't forget to call {@link MessagePort.start}.
     */
    connectSync<T extends any[]>(handlerId: string | MessagePortHandlerId<T>, ...params: T): MessagePort
}
