// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { Disposable, Rc, ReferenceCounter } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EventWatcherId, FileSystemWatcherClient, FileSystemWatcherService, WatchOptions } from '../common/filesystem-watcher-protocol';

type WatcherUniqueId = string;
type WatcherLocalId = number;

/**
 * This component caches watchers based on the options: If you use the same
 * options multiple times then only one watcher will be allocated.
 */
@injectable()
export class FileSystemWatcherServiceCache implements FileSystemWatcherService {

    protected service?: FileSystemWatcherService;
    protected client?: FileSystemWatcherClient;

    protected handles = new Map<WatcherUniqueId, Promise<WatcherHandle>>();
    protected rcs = new Map<WatcherLocalId, Rc>();
    protected localId = 0;

    @inject(ReferenceCounter)
    protected referenceCounter: ReferenceCounter;

    setService(service: FileSystemWatcherService): void {
        this.service = service;
    }

    setClient(client: FileSystemWatcherClient): void {
        this.service!.setClient(client);
    }

    async watchFileChanges(uri: string, options?: WatchOptions): Promise<[WatcherLocalId, EventWatcherId]> {
        const localId = this.localId++;
        const handle = (await this.getOrCreateWatcherHandle(uri, options)).clear();
        this.rcs.set(localId, this.referenceCounter.getRc(handle));
        return [localId, handle.eventId];
    }

    async unwatchFileChanges(localId: WatcherLocalId): Promise<void> {
        const rc = this.rcs.get(localId);
        if (rc) {
            this.rcs.delete(localId);
            rc.dispose();
        }
    }

    protected getOrCreateWatcherHandle(uri: string, options?: WatchOptions): Promise<WatcherHandle> {
        const uniqueId = this.getWatcherKey(uri, options);
        let handle = this.handles.get(uniqueId);
        if (!handle) {
            this.handles.set(uniqueId, handle = this.service!.watchFileChanges(uri, options)
                .then(([remoteId, eventId]) => new WatcherHandle(eventId, () => {
                    this.service!.unwatchFileChanges(remoteId);
                    this.handles.delete(uniqueId);
                }))
            );
        }
        return handle;
    }

    /**
     * Generate a unique key given some `URI` and some `WatchOptions`.
     */
    protected getWatcherKey(uri: string, options?: WatchOptions): string {
        return uri + (options?.ignored?.slice(0).sort().join() ?? '');
    }
}

export class WatcherHandle implements Disposable {

    #disposal?: NodeJS.Timeout;
    #onDispose: () => void;

    constructor(
        public eventId: EventWatcherId,
        onDispose: () => void
    ) {
        this.#onDispose = onDispose;
    }

    clear(): this {
        if (this.#disposal) {
            clearTimeout(this.#disposal);
            this.#disposal = undefined;
        }
        return this;
    }

    dispose(): void {
        if (!this.#disposal) {
            this.#disposal = setTimeout(this.#onDispose, 60_000);
        }
    }
}
