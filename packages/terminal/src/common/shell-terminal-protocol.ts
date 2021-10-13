/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { OS } from '@theia/core/lib/common/os';
import { TerminalSpawnOptions } from '@theia/process/lib/node';
import * as rt from './remote-terminal-protocol';

export const SHELL_REMOTE_TERMINAL_PATH = '/services/shell-remote-terminal';

export const ShellRemoteTerminalServer = Symbol('ShellRemoteTerminalServer');
export interface ShellRemoteTerminalServer {

    spawn(id: rt.RemoteTerminalConnectionId, options: {}): Promise<rt.RemoteTerminalSpawnResponse>

    attach(id: rt.RemoteTerminalConnectionId, options: {}): Promise<rt.RemoteTerminalAttachResponse>
}

export type ShellTerminalOSPreferences<T> = {
    [key in OS.Type]: T
};

export interface ShellTerminalPreferences {
    shell: ShellTerminalOSPreferences<string | undefined>
    shellArgs: ShellTerminalOSPreferences<string[]>
};

export interface ShellRemoteTerminalSpawnOptions extends TerminalSpawnOptions {

    shellPreferences?: ShellTerminalPreferences

    shell?: string

    shellArgs?: string[]

    /**
     * I still don't understand this option.
     */
    isPseudo?: boolean
}
