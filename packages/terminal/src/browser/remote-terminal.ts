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

import { Disposable } from '@theia/core';
import { TerminalProcessInfo } from '@theia/process/lib/node';
import { RemoteTerminalProxy, RemoteTerminalConnectionId } from '../common/terminal-protocol';

/**
 * Handle to a `RemoteTerminal`, you can use it to attach events on `remote`.
 *
 * You still need to spawn/attach a process to this `RemoteTerminalHandle`.
 */
export interface RemoteTerminalHandle extends Disposable {

    /**
     * Handle internal tracking id.
     */
    readonly uuid: RemoteTerminalConnectionId

    /**
     * Proxy to the remote terminal.
     */
    readonly remote: RemoteTerminalProxy
}

/**
 * Handle to a `Terminal` running remotely.
 */
export interface RemoteTerminal {

    readonly handle: RemoteTerminalHandle

    /**
     * Id of the underlying `Terminal` as registered in the `TerminalManager`.
     */
    readonly terminalId: number

    readonly info: TerminalProcessInfo
}
