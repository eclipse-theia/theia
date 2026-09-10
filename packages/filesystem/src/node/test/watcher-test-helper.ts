// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { NodeDirectoryWatcherTimings } from '../nodejs-watcher/node-directory-watcher';

/** Scaled down so the suite stays quick; only the order of the delays matters. */
export const WATCHER_TIMINGS: NodeDirectoryWatcherTimings = {
    changeDelay: 5,
    deleteDelay: 20,
    existencePollDelay: 20,
    deferredDisposalTimeout: 30
};

export const NO_LOGGING = { verbose: false, info: () => { }, error: () => { } };

/**
 * A directory to act on, one per test, so that no test depends on what another one left behind. The root is
 * passed in because `temp` is a root-level dev dependency, and this file is published.
 */
export class TempDir {

    constructor(readonly root: string) { }

    path(...segments: string[]): string {
        return path.resolve(this.root, ...segments);
    }

    write(...segments: string[]): string {
        const target = this.path(...segments);
        fs.writeFileSync(target, 'content');
        return target;
    }

    mkdir(...segments: string[]): string {
        const target = this.path(...segments);
        fs.mkdirSync(target, { recursive: true });
        return target;
    }

    remove(...segments: string[]): void {
        fs.removeSync(this.path(...segments));
    }
}
