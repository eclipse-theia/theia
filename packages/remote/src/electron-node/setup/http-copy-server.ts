// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { IncomingMessage, ServerResponse } from 'http';
import { AddressInfo } from 'net';

declare function __require(module: string): unknown;

export function launchNodeHttpCopyServer(destination: string, port: number): void {

    const http = __require('http') as typeof import('http');
    const fs = __require('fs') as typeof import('fs');

    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {

        const stream = req.pipe(fs.createWriteStream(destination));
        stream.on('finish', () => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.end('Copyed successful');
            server.close();
        });
        stream.on('error', (err: Error) => {
            console.error(err.message);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain');
            res.end(`Copy failed: ${err.message}`);
            server.close();
        });
    });

    server.listen(port, () => {
        console.log(`Port:${(server.address() as AddressInfo).port}`);
    });
}
