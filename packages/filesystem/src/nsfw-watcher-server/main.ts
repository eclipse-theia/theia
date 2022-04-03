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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import '@theia/core/shared/reflect-metadata';
import * as yargs from '@theia/core/shared/yargs';
import { serve } from '@theia/core/lib/node/json-rpc-ipc';
import { NsfwFileSystemWatcherServer } from '../node/nsfw-filesystem-watcher-server';

const options = yargs
    .option('verbose', {
        type: 'boolean',
        default: false
    })
    .option('eventDebounceMs', {
        type: 'number',
        default: 200
    })
    .parse();

serve(new NsfwFileSystemWatcherServer(options));
