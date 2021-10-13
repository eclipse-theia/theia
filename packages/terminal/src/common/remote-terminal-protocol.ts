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

import { Disposable, Event } from '@theia/core';
import { TerminalDataEvent, TerminalExitEvent, TerminalProcessInfo, TerminalSpawnOptions } from '@theia/process/lib/node';

export const REMOTE_TERMINAL_PATH = '/services/remote-terminal';
export const REMOTE_TERMINAL_NEW_CONNECTION_PATH_TEMPLATE = `${REMOTE_TERMINAL_PATH}/new-connection/:id`;

/**
 * Universally Unique Identifier (UUID).
 */
export type RemoteTerminalConnectionId = string;

export interface RemoteTerminalOptions /* extends Serializable */ {

    /**
     * Keep this process running even if the associated frontend disconnects.
     *
     * This is useful for things like persisting opened shells in the UI after reloading a browser tab.
     *
     * Defaults to `false`.
     */
    persist?: boolean
}

export interface RemoteTerminalAttachOptions /* extends Serializable */ {
    terminalId: number
}

export const RemoteTerminalServer = Symbol('RemoteTerminalServer');
/**
 * In order to create or attach, you first need to initialize a connection using
 * `REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE` and specify an arbitrary but unique `id`.
 *
 * `Terminal` events will be passed through this connection after you call
 * `create(id, ...)` or `attach(id, ...)`.
 */
export interface RemoteTerminalServer {

    spawn(id: RemoteTerminalConnectionId, options: RemoteTerminalOptions & TerminalSpawnOptions): Promise<RemoteTerminalSpawnResponse>

    attach(id: RemoteTerminalConnectionId, options: RemoteTerminalAttachOptions): Promise<RemoteTerminalAttachResponse>
}

export interface RemoteTerminalSpawnResponse {
    terminalId: number
    info: TerminalProcessInfo
}

export interface RemoteTerminalAttachResponse {
    info: TerminalProcessInfo
}

/**
 * Disposing a proxy means closing its connection to a remote.
 */
export interface RemoteTerminalProxy extends Disposable {

    readonly onData: Event<TerminalDataEvent>

    readonly onExit: Event<TerminalExitEvent>

    readonly onClose: Event<TerminalExitEvent>

    getExitStatus(): Promise<TerminalExitEvent | undefined>

    resize(cols: number, rows: number): Promise<void>

    write(data: string): Promise<void>

    kill(): Promise<void>
}
