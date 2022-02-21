/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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
import { ChannelPipe } from './channel';
import { RpcHandler, RpcProxyHandler } from './rpc-proxy';
import * as fs from 'fs';

/**
 * This file is for fiddling around and testing. Not production code.
 */

const pipe = new ChannelPipe();

interface ReadFile {
    read(path: string): Promise<ArrayBuffer>;
}

class Server implements ReadFile {
    read(path: string): Promise<ArrayBuffer> {
        const bytes = fs.readFileSync(path);
        const result = new ArrayBuffer(bytes.byteLength);
        bytes.copy(new Uint8Array(result));
        return Promise.resolve(result);
    }
}

const handler = new RpcHandler(new Server());
handler.onChannelOpen(pipe.right);

const proxyHandler = new RpcProxyHandler<ReadFile>();
// eslint-disable-next-line no-null/no-null
const proxy: ReadFile = new Proxy(Object.create(null), proxyHandler);
proxyHandler.onChannelOpen(pipe.left);

const t0 = new Date().getTime();

proxy.read(process.argv[2]).then(value => {
    const t1 = new Date().getTime();
    console.log(`read file of length: ${value.byteLength} in ${t1 - t0}ms`);
    console.log(value.slice(0, 20));
}).catch(e => {
    console.log(e);
});

