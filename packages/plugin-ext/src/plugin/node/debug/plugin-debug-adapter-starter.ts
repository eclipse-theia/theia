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
import * as theia from '@theia/plugin';
import { CommunicationProvider } from '@theia/debug/lib/common/debug-model';
import { ChildProcess, spawn, fork, ForkOptions } from 'child_process';

/**
 * Starts debug adapter process.
 */
export function startDebugAdapter(executable: theia.DebugAdapterExecutable): CommunicationProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = { stdio: ['pipe', 'pipe', 2] };

    if (executable.options) {
        options.cwd = executable.options.cwd;

        // The additional environment of the executed program or shell. If omitted
        // the parent process' environment is used. If provided it is merged with
        // the parent process' environment.
        options.env = Object.assign({}, process.env);
        Object.assign(options.env, executable.options.env);
    }

    let childProcess: ChildProcess;
    const { command, args } = executable;
    if (command === 'node') {
        if (Array.isArray(args) && args.length > 0) {
            const isElectron = !!process.env['ELECTRON_RUN_AS_NODE'];
            const forkOptions: ForkOptions = {
                env: options.env,
                execArgv: isElectron ? ['-e', 'delete process.env.ELECTRON_RUN_AS_NODE;require(process.argv[1])'] : [],
                silent: true
            };
            if (options.cwd) {
                forkOptions.cwd = options.cwd;
            }
            options.stdio.push('ipc');
            forkOptions.stdio = options.stdio;
            childProcess = fork(args[0], args.slice(1), forkOptions);
        } else {
            throw new Error(`It is not possible to launch debug adapter with the command: ${JSON.stringify(executable)}`);
        }
    } else {
        childProcess = spawn(command, args, options);
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
export function connectDebugAdapter(server: theia.DebugAdapterServer): CommunicationProvider {
    const socket = net.createConnection(server.port, server.host);
    return {
        input: socket,
        output: socket,
        dispose: () => socket.end()
    };
}
