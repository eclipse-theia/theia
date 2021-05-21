/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Event, Disposable } from '@theia/core';
import { TerminalExitEvent, TerminalDataEvent, TerminalSpawnOptions } from '@theia/process/lib/node';
import { TerminalProcessInfo } from './base-terminal-protocol';

export const REMOTE_TERMINAL_PATH = '/services/terminals';
export const REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE = `${REMOTE_TERMINAL_PATH}/connection/new/:id`;

export const RemoteTerminalServer = Symbol('RemoteTerminalServer');
/**
 * In order to create or attach, you first need to initialize a connection using
 * `REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE` and specify an arbitrary `id`.
 *
 * `Terminal` events will be passed through this connection after you call
 * `create(id, ...)` or `attach(id, ...)`.
 */
export interface RemoteTerminalServer {

    create(id: number, options: TerminalSpawnOptions): Promise<{ terminalId: number, info: TerminalProcessInfo }>

    attach(id: number, terminalId: number): Promise<{ info: TerminalProcessInfo }>
}

/**
 * Handle to a `Terminal` running remotely.
 */
export interface RemoteTerminal extends Disposable {

    /**
     * Internal tracking id.
     */
    readonly _id: number

    /**
     * Id of the underlying `Terminal` as registered in the `TerminalManager`.
     */
    readonly terminalId: number

    readonly info: TerminalProcessInfo

    readonly remote: RemoteTerminalProxy;
}

export interface RemoteTerminalProxy extends Disposable {

    readonly onData: Event<TerminalDataEvent>

    readonly onExit: Event<TerminalExitEvent>

    readonly onClose: Event<TerminalExitEvent>

    getExitStatus(): Promise<TerminalExitEvent | undefined>;

    write(data: string): Promise<void>

    kill(): Promise<void>
}
