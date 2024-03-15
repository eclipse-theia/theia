// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { createConnection } from 'net';
import { stdin, argv, stdout } from 'process';

/**
 * this node.js Program is supposed to be executed by an docker exec session inside a docker container.
 * It uses a tty session to listen on stdin and send on stdout all communication with the theia backend running inside the container.
 */

let backendPort: number | undefined = undefined;
argv.slice(2).forEach(arg => {
    if (arg.startsWith('-target-port')) {
        backendPort = parseInt(arg.split('=')[1]);
    }
});

if (!backendPort) {
    throw new Error('please start with -target-port={port number}');
}
if (stdin.isTTY) {
    stdin.setRawMode(true);
}
const connection = createConnection(backendPort, '0.0.0.0');

connection.pipe(stdout);
stdin.pipe(connection);

connection.on('error', error => {
    console.error('connection error', error);
});

connection.on('close', () => {
    console.log('connection closed');
    process.exit(0);
});

// keep the process running
setInterval(() => { }, 1 << 30);
