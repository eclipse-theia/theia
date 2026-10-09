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
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
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

/** A watch shared by every request that resolves to the same target. Implementations decide whether it recurses. */
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

/** Handles disposal and logging for a watcher. Subclasses decide how to observe the file system. */
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

    abstract addRequest(watcherId: number, request: WatchRequest): void;
    abstract removeRequest(watcherId: number): void;

    /**
     * Marks this watcher disposed.
     * @returns `false` if it already was, in which case the caller must not clean up again.
     */
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

/** Serves either recursive or non-recursive requests, and decides which watcher serves each one. */
export interface WatcherProvider {
    /** @returns `true` if this provider serves requests made with these options. */
    canHandle(options: ResolvedWatchOptions): boolean;
    /** Serves `request` under `watcherId`, on a watcher shared with requests resolving to the same target. */
    watch(watcherId: number, request: WatchRequest): Promise<void>;
    /**
     * Releases the request registered under `watcherId`.
     * @returns `true` if this provider served the request.
     */
    unwatch(watcherId: number): boolean;
}

/** A {@link WatcherProvider} that keeps one watcher per target. Subclasses decide which key a target maps to. */
export abstract class AbstractWatcherProvider implements WatcherProvider {

    private readonly watchersByTarget = new Map<string, FileSystemWatcher>();
    /** The watcher that serves each request, by `watcherId`. */
    private readonly watchersByRequest = new Map<number, FileSystemWatcher>();

    /** Every watcher this provider currently has open. */
    protected get activeWatchers(): readonly FileSystemWatcher[] {
        return Array.from(this.watchersByTarget.values());
    }

    abstract canHandle(options: ResolvedWatchOptions): boolean;
    abstract watch(watcherId: number, request: WatchRequest): Promise<void>;

    unwatch(watcherId: number): boolean {
        const watcher = this.watchersByRequest.get(watcherId);
        if (!watcher) {
            return false;
        }
        this.watchersByRequest.delete(watcherId);
        watcher.removeRequest(watcherId);
        return true;
    }

    /** The watcher serving a request, if this provider has one. */
    protected watcherFor(watcherId: number): FileSystemWatcher | undefined {
        return this.watchersByRequest.get(watcherId);
    }

    /** Puts a request on a watcher and records which one, so {@link unwatch} finds it again. */
    protected serve(watcherId: number, watcher: FileSystemWatcher, request: WatchRequest): void {
        watcher.addRequest(watcherId, request);
        this.assign(watcherId, watcher);
    }

    /** Records the watcher of a request that reached it without {@link serve}, such as through a re-key. */
    protected assign(watcherId: number, watcher: FileSystemWatcher): void {
        this.watchersByRequest.set(watcherId, watcher);
    }

    /**
     * Returns the watcher under `watcherKey`, or creates one. A disposed watcher stays in the map until a later
     * promise callback removes it, so it is replaced here rather than handed a new request.
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
            // Requests it handed to another watcher already point there, so drop only the ones still on it.
            for (const [watcherId, serving] of this.watchersByRequest) {
                if (serving === watcher) {
                    this.watchersByRequest.delete(watcherId);
                }
            }
        });
        return watcher;
    }

    /** @returns `true` if `watcher` is the one registered under `watcherKey`. */
    protected isRegisteredAs(watcher: FileSystemWatcher, watcherKey: string): boolean {
        return this.watchersByTarget.get(watcherKey) === watcher;
    }

    /** Forgets every key a watcher is registered under, so that it can be registered under another. */
    protected unregisterWatcher(watcher: FileSystemWatcher): void {
        for (const [watcherKey, registered] of this.watchersByTarget) {
            if (registered === watcher) {
                this.watchersByTarget.delete(watcherKey);
            }
        }
    }
}
