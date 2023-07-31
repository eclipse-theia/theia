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

import { createChannelNamespace } from '../messaging/channels';

export interface RpcCreateMessage {
    proxyPath: string
}

export interface RpcPortForwardMessage {
    proxyId: unknown
}

export interface RpcNotificationMessage {
    method: string
    params?: unknown[]
}

export interface RpcRequestMessage {
    requestId: number
    method: string
    params?: unknown[]
}

export interface RpcRequestSyncMessage {
    proxyId: unknown
    method: string
    params?: unknown[]
}

export interface RpcResponseMessage {
    requestId: number
    error?: Error
    result?: unknown
}

export interface RpcCancelMessage {
    requestId: number
}

export const THEIA_RPC_CHANNELS = createChannelNamespace('theia-rpc', channel => ({
    create: channel<(message: RpcCreateMessage) => Promise<number>>(),
    createSync: channel<(message: RpcCreateMessage) => number>(),
    portForward: channel<(message: RpcPortForwardMessage) => void>(),
    notification: channel<(message: RpcNotificationMessage) => void>(),
    request: channel<(message: RpcRequestMessage) => void>(),
    requestSync: channel<(message: RpcRequestSyncMessage) => void>(),
    response: channel<(message: RpcResponseMessage) => void>(),
    cancel: channel<(message: RpcCancelMessage) => void>()
}));
