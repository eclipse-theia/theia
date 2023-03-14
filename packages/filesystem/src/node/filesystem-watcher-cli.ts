// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { CliContribution } from '@theia/core/lib/node';
import { injectable } from '@theia/core/shared/inversify';
import { Argv } from '@theia/core/shared/yargs';

@injectable()
export class FileSystemWatcherCli implements CliContribution {

    singleThreaded: boolean;
    watcherVerbose: boolean;

    configure(argv: Argv<{}>): void {
        argv
            .option('--cluster', { default: true, type: 'boolean', description: 'Run the filesystem watcher in the main backend process' })
            .option('--watcher-verbose', { default: false, type: 'boolean', description: 'Enable verbose logs for the filesystem watchers' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setArguments(args: any): void {
        this.singleThreaded = args.cluster;
        this.watcherVerbose = args.watcherVerbose;
    }
}
