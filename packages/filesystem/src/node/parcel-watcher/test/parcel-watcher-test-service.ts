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
import { WatchRequest, WatcherProvider } from '../../filesystem-watcher.js';
import { FileSystemWatcherServiceImpl } from '../../filesystem-watcher-service-impl.js';
import { ParcelFileSystemWatcherServerOptions, ParcelWatcher, ParcelWatcherExcludes, RecursiveWatcherProvider } from '../parcel-watcher.js';

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
 * A {@link RecursiveWatcherProvider} that creates {@link TrackedParcelWatcher}s and keeps
 * every one of them, so that they can all be disposed at once.
 */
export class TrackedRecursiveWatcherProvider extends RecursiveWatcherProvider {

    protected readonly trackedWatchers: TrackedParcelWatcher[] = [];

    protected override createWatcher(request: WatchRequest): ParcelWatcher {
        const watcherOptions: ParcelWatcherExcludes = {
            ignored: request.ignored.map(pattern => new Minimatch(pattern, { dot: true })),
            ignorePatterns: [...request.ignored]
        };
        const watcher = new TrackedParcelWatcher(undefined, request.path, watcherOptions, this.options, this.client, this.deferredDisposalTimeout);
        this.trackedWatchers.push(watcher);
        return watcher;
    }

    /**
     * Dispose all watchers created by this provider and wait until their native parcel
     * subscriptions are unsubscribed.
     */
    async disposeAllWatchers(): Promise<void> {
        await Promise.all(this.trackedWatchers.map(watcher => watcher.disposeAndWait()));
        this.trackedWatchers.length = 0;
    }
}

/**
 * Test variant of the watcher service that tracks every created parcel watcher so tests can
 * fully unsubscribe them before deleting the watched directories.
 *
 * This must happen before the temp directory cleanup: when a watched root is deleted
 * while still subscribed, parcel's macOS FSEvents backend stops the stream in place
 * without ever removing the subscription from its shared backend registry. The shared
 * backend thread can then exit and every real subscription created afterwards in the
 * same process silently receives no events anymore.
 */
export class ParcelWatcherTestService extends FileSystemWatcherServiceImpl {

    protected override createProviders(options: ParcelFileSystemWatcherServerOptions): WatcherProvider[] {
        return super.createProviders(options).map(provider => provider instanceof RecursiveWatcherProvider
            ? new TrackedRecursiveWatcherProvider(options, this.maybeClient)
            : provider);
    }

    /**
     * Dispose all parcel watchers created by this service and wait until their native parcel
     * subscriptions are unsubscribed.
     */
    async disposeAllWatchers(): Promise<void> {
        await Promise.all(this.providers
            .filter((provider): provider is TrackedRecursiveWatcherProvider => provider instanceof TrackedRecursiveWatcherProvider)
            .map(provider => provider.disposeAllWatchers()));
    }
}
