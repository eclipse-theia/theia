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
import { MessageConnection } from '@theia/core/shared/vscode-ws-jsonrpc';
import { TerminalExitEvent, TerminalProcessInfo } from '@theia/process/lib/node';
import * as rt from '../common/remote-terminal-protocol';

/**
 * Handle to an un-initialized `RemoteTerminal`, you can use it to attach events on `proxy`.
 *
 * You still need to spawn/attach a process to this `RemoteTerminal`.
 */
export interface RemoteTerminal extends Disposable {

    /**
     * Internal tracking id.
     */
    readonly id: rt.RemoteTerminalConnectionId

    /**
     * Proxy to the remote `Terminal`.
     */
    readonly proxy: rt.RemoteTerminalProxy

    /**
     * Undefined until the remote side notifies us that the process exited.
     */
    readonly exitStatus?: TerminalExitEvent

    /**
     * Throws if already connected or disposed.
     */
    connect(connection: MessageConnection): void

    /**
     * Throws if already attached or disposed.
     */
    attach(terminalId: number, info: TerminalProcessInfo): AttachedRemoteTerminal

    isConnected(): boolean

    isAttached(): this is AttachedRemoteTerminal

    isDisposed(): boolean
}

export interface AttachedRemoteTerminal extends RemoteTerminal {

    /**
     * Id of the remote `Terminal`. Always positive.
     */
    readonly terminalId: number

    /**
     * Information about the remotely running `Terminal`.
     */
    readonly info: TerminalProcessInfo
}

export namespace RemoteTerminal {

    /**
     * Throws if `terminal` is not attached.
     */
    export function ensureAttached(terminal: RemoteTerminal): AttachedRemoteTerminal {
        if (!terminal.isAttached()) {
            throw new Error(`terminal is not attached, uuid ${terminal.id}`);
        }
        return terminal;
    }

    /**
     * Throws if `terminal` is connected.
     */
    export function ensureNotConnected(terminal: RemoteTerminal): RemoteTerminal {
        if (terminal.isConnected()) {
            throw new Error(`terminal is already connected, uuid ${terminal.id}`);
        }
        return terminal;
    }

    /**
     * Throws if `terminal` is attached.
     */
    export function ensureNotAttached(terminal: RemoteTerminal): RemoteTerminal {
        if (terminal.isAttached()) {
            throw new Error(`terminal is already attached, uuid ${terminal.id} terminalId ${terminal.terminalId}`);
        }
        return terminal;
    }

    /**
     * Throws if `terminal` is disposed.
     */
    export function ensureNotDisposed(terminal: RemoteTerminal): RemoteTerminal {
        if (terminal.isDisposed()) {
            throw new Error('terminal is disposed');
        }
        return terminal;
    }
}
