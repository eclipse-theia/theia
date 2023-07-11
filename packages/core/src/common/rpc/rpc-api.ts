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

import type { CancellationToken } from '../cancellation';

/**
 * Execute remote functions.
 */
export interface RpcClient {
    sendNotification?(method: string, params?: unknown[]): void
    sendRequest?(method: string, params?: unknown[], cancel?: CancellationToken): Promise<unknown>
    sendRequestSync?(method: string, params?: unknown[]): unknown
}

/**
 * Handle remote function calls.
 */
export interface RpcHandler {
    handleNotification?(handler: (method: string, params?: unknown[]) => void): void
    handleRequest?(handler: (method: string, params: unknown[] | undefined, cancel: CancellationToken) => unknown): void
    handleRequestSync?(handler: (method: string, params?: unknown[]) => unknown): void
}
