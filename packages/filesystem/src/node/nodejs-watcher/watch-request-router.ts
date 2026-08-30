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

import * as path from 'path';
import { Minimatch } from 'minimatch';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { FileChangeType, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { FileChangeCollection } from '../file-change-collection';
import { WatchRequest } from '../filesystem-watcher';
import { WatcherHost } from './watcher-host';

/** A {@link WatchRequest} resolved against the file system. */
export interface DirectoryWatchRequest extends WatchRequest {
    /** Where `path` points: the watched directory (every child) or one file in it. Reports use `path`. */
    readonly realPath: string;
}

/** A resolved change to a direct child of the watched directory. */
export interface ResolvedChange {
    readonly fileName: string;
    readonly type: FileChangeType;
}

/** A change as one client will be told about it. */
interface ReportedChange {
    readonly clientId: number;
    readonly uri: string;
    readonly type: FileChangeType;
}

/**
 * Holds the requests one watcher serves and turns resolved changes into notifications. None of it touches the
 * event state machine; it only needs the watched directory, which it asks for rather than storing.
 */
export class WatchRequestRouter {

    private readonly requests = new Map<number, DirectoryWatchRequest>();
    /** Compiled excludes, shared across requests, which mostly carry the same `files.watcherExclude`. */
    private readonly matchers = new Map<string, Minimatch>();

    constructor(
        protected readonly client: FileSystemWatcherServiceClient,
        protected readonly host: WatcherHost,
        protected readonly watchedDirectory: () => string
    ) { }

    get size(): number {
        return this.requests.size;
    }

    add(watcherId: number, request: DirectoryWatchRequest): void {
        this.requests.set(watcherId, request);
    }

    /** Whether there was a request to remove. */
    remove(watcherId: number): boolean {
        return this.requests.delete(watcherId);
    }

    /** Narrows every request made for `target` to the file it turned out to be. */
    narrow(target: string, realPath: string): void {
        for (const [watcherId, request] of this.requests) {
            if (request.path === target) {
                this.requests.set(watcherId, { ...request, realPath });
            }
        }
    }

    /** Requests whose own path exists, so a recovered directory does not announce files that are still gone. */
    async existingRequests(): Promise<DirectoryWatchRequest[]> {
        const entries = Array.from(this.requests);
        const existing = await Promise.all(entries.map(([, request]) => this.host.exists(request.path)));
        return entries
            .filter(([watcherId], index) => existing[index] && this.requests.has(watcherId))
            .map(([, request]) => request);
    }

    /** Reports changes to direct children, mapped and filtered per request. */
    report(changes: readonly ResolvedChange[], requests: Iterable<DirectoryWatchRequest> = this.requests.values()): void {
        const reported: ReportedChange[] = [];
        for (const request of requests) {
            for (const { fileName, type } of changes) {
                const uri = this.resolveChildPath(request, fileName);
                // Excludes filter children, never the path a client explicitly asked to watch.
                if (uri && (uri === request.path || !this.isIgnored(request, uri))) {
                    reported.push({ clientId: request.clientId, uri, type });
                }
            }
        }
        this.emit(reported);
    }

    /** Reports a change to the watched path itself, which each request hears about under its own path. */
    reportWatchedPath(type: FileChangeType, requests: Iterable<DirectoryWatchRequest> = this.requests.values()): void {
        this.emit(Array.from(requests, request => ({ clientId: request.clientId, uri: request.path, type })));
    }

    /** Notifies each client once per watched path, so overlapping requests do not report twice. */
    private emit(reported: readonly ReportedChange[]): void {
        if (reported.length === 0) {
            return;
        }
        const perClient = new Map<number, FileChangeCollection>();
        for (const { clientId, uri, type } of reported) {
            let collection = perClient.get(clientId);
            if (!collection) {
                perClient.set(clientId, collection = new FileChangeCollection());
            }
            collection.push({ uri: FileUri.create(uri).toString(), type });
        }
        for (const [clientId, collection] of perClient) {
            this.client.onDidFilesChanged({ clients: [clientId], changes: collection.values() });
        }
    }

    /** The path a request reports a child change under, or `undefined` if the child is none of its business. */
    protected resolveChildPath(request: DirectoryWatchRequest, fileName: string): string | undefined {
        const directory = this.watchedDirectory();
        // Both sides are resolved separately, so compare them the way the host resolves names.
        if (this.host.samePath(request.realPath, directory)) {
            return path.resolve(request.path, fileName);
        }
        return this.host.samePath(path.resolve(directory, fileName), request.realPath) ? request.path : undefined;
    }

    protected isIgnored(request: DirectoryWatchRequest, changed: string): boolean {
        return request.ignored.some(pattern => this.matcher(pattern).match(changed));
    }

    private matcher(pattern: string): Minimatch {
        let matcher = this.matchers.get(pattern);
        if (!matcher) {
            this.matchers.set(pattern, matcher = new Minimatch(pattern, { dot: true }));
        }
        return matcher;
    }
}
