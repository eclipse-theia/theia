// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Minimatch } from 'minimatch';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { AsyncSubscription } from '@theia/core/shared/@parcel/watcher';
import { WatchOptions } from '../../../common/filesystem-watcher-protocol';
import { ParcelFileSystemWatcherService, ParcelWatcher, ParcelWatcherOptions } from '../parcel-filesystem-service';

/**
 * A {@link ParcelWatcher} whose disposal can be awaited up to and including the native
 * parcel unsubscribe, which the production disposal only fires and forgets.
 */
export class TrackedParcelWatcher extends ParcelWatcher {

    protected readonly whenStopped = new Deferred<void>();

    protected override async stopWatcher(watcher: AsyncSubscription): Promise<void> {
        await super.stopWatcher(watcher);
        this.whenStopped.resolve();
    }

    /**
     * Dispose immediately, bypassing the reference counting and the deferred disposal
     * timeout, and resolve only once the native parcel subscription is unsubscribed.
     */
    async disposeAndWait(): Promise<void> {
        this._dispose();
        // `false` also covers a disposal that raced the subscribe: in that case `start()`
        // stops the just created subscription itself before settling `whenStarted`.
        const started = await this.whenStarted.catch(() => false);
        if (started) {
            await this.whenStopped.promise;
        }
    }
}

/**
 * Test variant of the watcher service that tracks every created watcher so tests can
 * fully unsubscribe them before deleting the watched directories.
 *
 * This must happen before the temp directory cleanup: when a watched root is deleted
 * while still subscribed, parcel's macOS FSEvents backend stops the stream in place
 * without ever removing the subscription from its shared backend registry. The shared
 * backend thread can then exit and every real subscription created afterwards in the
 * same process silently receives no events anymore.
 */
export class ParcelWatcherTestService extends ParcelFileSystemWatcherService {

    protected readonly trackedWatchers: TrackedParcelWatcher[] = [];

    protected override createWatcher(clientId: number, fsPath: string, options: WatchOptions): ParcelWatcher {
        const watcherOptions: ParcelWatcherOptions = {
            ignored: options.ignored
                .map(pattern => new Minimatch(pattern, { dot: true })),
            ignorePatterns: options.ignored,
        };
        const watcher = new TrackedParcelWatcher(clientId, fsPath, watcherOptions, this.options, this.maybeClient);
        this.trackedWatchers.push(watcher);
        return watcher;
    }

    /**
     * Dispose all watchers created by this service and wait until their native parcel
     * subscriptions are unsubscribed.
     */
    async disposeAllWatchers(): Promise<void> {
        await Promise.all(this.trackedWatchers.map(watcher => watcher.disposeAndWait()));
        this.trackedWatchers.length = 0;
    }
}
