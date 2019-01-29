/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as net from 'net';
import { CommunicationProvider, DebugAdapterExecutable } from '@theia/debug/lib/common/debug-model';
import { ChildProcess, spawn, fork } from 'child_process';

/**
 * Starts debug adapter process.
 */
export function startDebugAdapter(executable: DebugAdapterExecutable): CommunicationProvider {
    let childProcess: ChildProcess;
    if ('command' in executable) {
        const { command, args } = executable;
        childProcess = spawn(command, args, { stdio: ['pipe', 'pipe', 2] }) as ChildProcess;
    } else if ('modulePath' in executable) {
        const { modulePath, args } = executable;
        childProcess = fork(modulePath, args, { stdio: ['pipe', 'pipe', 2, 'ipc'] });
    } else {
        throw new Error(`It is not possible to launch debug adapter with the command: ${JSON.stringify(executable)}`);
    }

    return {
        input: childProcess.stdin,
        output: childProcess.stdout,
        dispose: () => childProcess.kill()
    };
}

/**
 * Connects to a remote debug server.
 */
export function connectDebugAdapter(serverPort: number): CommunicationProvider {
    const socket = net.createConnection(serverPort);
    return {
        input: socket,
        output: socket,
        dispose: () => socket.end()
    };
}
