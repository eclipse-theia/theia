// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import * as yargs from '@theia/core/shared/yargs';
import { RpcProxyFactory } from '@theia/core';
import { FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { ParcelFileSystemWatcherService } from './parcel-filesystem-service';
import { IPCEntryPoint } from '@theia/core/lib/node/messaging/ipc-protocol';

/* eslint-disable @typescript-eslint/no-explicit-any */

const options: {
    verbose: boolean
} = yargs
    .option('verbose', {
        default: false,
        alias: 'v',
        type: 'boolean'
    })
    .option('watchOptions', {
        alias: 'o',
        type: 'string',
        coerce: JSON.parse
    })
    .argv as any;

export default <IPCEntryPoint>(connection => {
    const server = new ParcelFileSystemWatcherService(options);
    const factory = new RpcProxyFactory<FileSystemWatcherServiceClient>(server);
    server.setClient(factory.createProxy());
    factory.listen(connection);
});
