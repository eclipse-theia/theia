// *****************************************************************************
// Copyright (C) 2026 Ehab Younes and others.
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

import { Deferred } from '@theia/core/lib/common/promise-util';
import { CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { WatchOptions } from '../common/filesystem-watcher-protocol';

/** How a watcher reports what it is doing. */
export interface WatcherLogger {
    verbose: boolean;
    info: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
}

/** A single client request served by a {@link FileSystemWatcher}. */
export interface WatchRequest {
    /** Client to route the changes of this request to. */
    readonly clientId: number;
    /** Path as requested by the client. Change URIs are built from it, never from the real path. */
    readonly path: string;
    /** Exclude patterns of this request alone. */
    readonly ignored: readonly string[];
}

/** One watch, shared by every request resolving to the same target. Whether it recurses is not said here. */
export interface FileSystemWatcher {
    /** A disposed watcher released its resources and must not be given further requests. */
    readonly isDisposed: boolean;
    /** Resolves once this watcher disposed itself. Never rejects. */
    readonly whenDisposed: Promise<void>;
    /** Serves `request` until {@link removeRequest} is called with the same `watcherId`. */
    addRequest(watcherId: number, request: WatchRequest): void;
    /** Releases a request. The watcher disposes itself once it has none left. */
    removeRequest(watcherId: number): void;
}

/** The disposal and logging every watcher needs, and nothing about how it observes the file system. */
export abstract class AbstractFileSystemWatcher implements FileSystemWatcher {

    private static debugIdSequence = 0;

    private readonly debugId = AbstractFileSystemWatcher.debugIdSequence++;
    private readonly disposalDeferred = new Deferred<void>();
    private readonly disposal = new CancellationTokenSource();

    readonly whenDisposed = this.disposalDeferred.promise;

    constructor(
        /** Path this watcher was asked about; the subclass decides what it resolves to. */
        protected readonly target: string,
        private readonly logger: WatcherLogger
    ) { }

    get isDisposed(): boolean {
        return this.disposal.token.isCancellationRequested;
    }

    /** Cancelled on disposal, so work in flight can abandon itself rather than check a flag. */
    protected get disposalToken(): CancellationToken {
        return this.disposal.token;
    }

    abstract addRequest(watcherId: number, request: WatchRequest): void;
    abstract removeRequest(watcherId: number): void;

    /** Marks this watcher disposed, once. `false` means it already was, so a caller should not clean up twice. */
    protected markDisposed(): boolean {
        if (this.isDisposed) {
            return false;
        }
        this.disposal.cancel();
        this.disposalDeferred.resolve();
        return true;
    }

    /** Logs as-is. Unlike {@link info} it is not prefixed, since these messages name their own path. */
    protected error(message: string, ...params: unknown[]): void {
        this.logger.error(message, ...params);
    }

    protected info(prefix: string, ...params: unknown[]): void {
        this.logger.info(`${prefix} ${this.constructor.name}(${this.debugId} at "${this.target}"):`, ...params);
    }

    protected debug(prefix: string, ...params: unknown[]): void {
        if (this.logger.verbose) {
            this.info(prefix, ...params);
        }
    }
}

export type ResolvedWatchOptions = Required<WatchOptions>;

/** Serves one kind of watching. The service asks who takes a request rather than knowing the kinds. */
export interface WatcherProvider {
    /** Whether requests made with these options are this provider's to serve. */
    canHandle(options: ResolvedWatchOptions): boolean;
    /** Serves `request` under `watcherId`, on a watcher shared with requests resolving to the same target. */
    watch(watcherId: number, request: WatchRequest): Promise<FileSystemWatcher>;
}

/** A {@link WatcherProvider} keeping one watcher per target, keyed however the subclass sees a target. */
export abstract class AbstractWatcherProvider implements WatcherProvider {

    private readonly watchersByTarget = new Map<string, FileSystemWatcher>();

    /** Every watcher this provider currently has open. */
    protected get activeWatchers(): readonly FileSystemWatcher[] {
        return Array.from(this.watchersByTarget.values());
    }

    abstract canHandle(options: ResolvedWatchOptions): boolean;
    abstract watch(watcherId: number, request: WatchRequest): Promise<FileSystemWatcher>;

    /**
     * The watcher under `watcherKey`, or a new one. Disposal is marked synchronously but leaves the map from
     * a promise callback, so without the check a request in between would attach to a dying watcher.
     */
    protected getOrCreateWatcher<T extends FileSystemWatcher>(watcherKey: string, create: () => T): T {
        const existing = this.watchersByTarget.get(watcherKey);
        if (existing && !existing.isDisposed) {
            return existing as T;
        }
        const watcher = create();
        this.watchersByTarget.set(watcherKey, watcher);
        watcher.whenDisposed.then(() => {
            if (this.watchersByTarget.get(watcherKey) === watcher) {
                this.watchersByTarget.delete(watcherKey);
            }
        });
        return watcher;
    }
}
