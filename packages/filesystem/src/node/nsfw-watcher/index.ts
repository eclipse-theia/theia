/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as yargs from 'yargs';
import { JsonRpcProxyFactory } from '@theia/core';
import { FileSystemWatcherClient } from '../../common/filesystem-watcher-protocol';
import { NsfwFileSystemWatcherServer } from './nsfw-filesystem-watcher';
import { IPCEntryPoint } from '@theia/core/lib/node/messaging/ipc-protocol';

// tslint:disable:no-any

const options: {
    verbose: boolean
} = yargs.option('verbose', {
    default: false,
    alias: 'v',
    type: 'boolean'
}).argv as any;

export default <IPCEntryPoint>(connection => {
    const server = new NsfwFileSystemWatcherServer(options);
    const factory = new JsonRpcProxyFactory<FileSystemWatcherClient>(server);
    server.setClient(factory.createProxy());
    factory.listen(connection);
});
