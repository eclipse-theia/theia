// *****************************************************************************
// Copyright (C) 2017-2018 TypeFox and others.
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

import { FileUri } from '@theia/core/lib/common/file-uri';
import { FileSystemWatcherService, FileSystemWatcherServiceClient, WatchOptions } from '../common/filesystem-watcher-protocol';
import { FileSystemWatcher, ResolvedWatchOptions, WatcherLogger, WatcherProvider } from './filesystem-watcher';
import { DirectoryWatcherProvider } from './nodejs-watcher/node-directory-watcher';
import { ParcelFileSystemWatcherServerOptions, RecursiveWatcherProvider } from './parcel-watcher/parcel-watcher';

/** Hands each request to the provider that takes it, and remembers which watcher ended up serving it. */
export class FileSystemWatcherServiceImpl implements FileSystemWatcherService {

    protected client: FileSystemWatcherServiceClient | undefined;

    protected watcherId = 0;

    /** Watchers by request, so that `unwatchFileChanges` finds the one holding it. */
    protected readonly watchersByRequest = new Map<number, FileSystemWatcher>();

    protected readonly logger: WatcherLogger;

    /** Asked in order which of them takes a request. */
    protected readonly providers: readonly WatcherProvider[];

    /**
     * `this.client` is undefined until someone sets it.
     */
    protected readonly maybeClient: FileSystemWatcherServiceClient = {
        onDidFilesChanged: event => this.client?.onDidFilesChanged(event),
        onError: event => this.client?.onError(event),
    };

    constructor(options?: Partial<ParcelFileSystemWatcherServerOptions>) {
        const resolved: ParcelFileSystemWatcherServerOptions = {
            parcelOptions: {},
            verbose: false,
            info: (message, ...args) => console.info(message, ...args),
            error: (message, ...args) => console.error(message, ...args),
            ...options
        };
        this.logger = resolved;
        this.providers = this.createProviders(resolved);
    }

    setClient(client: FileSystemWatcherServiceClient | undefined): void {
        this.client = client;
    }

    /** Requests resolving to the same target share a watcher. */
    async watchFileChanges(clientId: number, uri: string, options?: WatchOptions): Promise<number> {
        const resolvedOptions = this.resolveWatchOptions(options);
        const provider = this.providerFor(resolvedOptions);
        const watcherId = this.watcherId++;
        const watcher = await provider.watch(watcherId, { clientId, path: FileUri.fsPath(uri), ignored: resolvedOptions.ignored });
        this.watchersByRequest.set(watcherId, watcher);
        watcher.whenDisposed.then(() => this.watchersByRequest.delete(watcherId));
        return watcherId;
    }

    async unwatchFileChanges(watcherId: number): Promise<void> {
        const watcher = this.watchersByRequest.get(watcherId);
        if (watcher === undefined) {
            console.warn(`tried to de-allocate a disposed watcher: watcherId=${watcherId}`);
            return;
        }
        this.watchersByRequest.delete(watcherId);
        watcher.removeRequest(watcherId);
    }

    /** `options` is parcel-shaped because that is the binding adopters have; only the first provider reads that part. */
    protected createProviders(options: ParcelFileSystemWatcherServerOptions): WatcherProvider[] {
        return [
            new RecursiveWatcherProvider(options, this.maybeClient),
            new DirectoryWatcherProvider(options, this.maybeClient)
        ];
    }

    protected providerFor(options: ResolvedWatchOptions): WatcherProvider {
        const provider = this.providers.find(candidate => candidate.canHandle(options));
        if (!provider) {
            throw new Error(`No watcher provider takes options: ${JSON.stringify(options)}`);
        }
        return provider;
    }

    /**
     * Return fully qualified options. Watchers created before `recursive` existed were always recursive.
     */
    protected resolveWatchOptions(options?: WatchOptions): ResolvedWatchOptions {
        return {
            ignored: options?.ignored ?? [],
            recursive: options?.recursive ?? true
        };
    }

    protected debug(message: string, ...params: unknown[]): void {
        if (this.logger.verbose) {
            this.logger.info(message, ...params);
        }
    }

    dispose(): void {
        // Singletons shouldn't be disposed...
    }
}
