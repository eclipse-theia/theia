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

import { Disposable, ReferenceCounter } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    DidFilesChangedParams, EventWatcherId, FileSystemWatcherClient, FileSystemWatcherErrorParams, FileSystemWatcherService, WatchOptions
} from '../common/filesystem-watcher-protocol';

type WatcherLocalId = number;

/**
 * @internal
 *
 * This component maps watcher's `eventId` to the clients listening to it.
 *
 * Some clients will try to register themselves multiple times to the same
 * `eventId`. That's ok but we need to make sure we only unregister a given
 * client once all its references are gone.
 */
@injectable()
export class FileSystemWatcherClientRegistry {

    protected events = new Map<EventWatcherId, Map<FileSystemWatcherClient, Disposable>>();

    @inject(ReferenceCounter)
    protected referenceCounter: ReferenceCounter;

    forEach(eventId: EventWatcherId, callbackfn: (client: FileSystemWatcherClient) => void, thisArg?: unknown): void {
        this.events.get(eventId)?.forEach((value, key) => callbackfn.call(thisArg, key));
    }

    registerWatcherClient(eventId: EventWatcherId, client: FileSystemWatcherClient): Disposable {
        let clients = this.events.get(eventId);
        if (!clients) {
            this.events.set(eventId, clients = new Map());
        }
        let disposable = clients.get(client);
        if (!disposable) {
            clients.set(client, disposable = {
                dispose: () => {
                    clients!.delete(client);
                    if (clients!.size === 0) {
                        this.events.delete(eventId);
                    }
                }
            });
        }
        return this.referenceCounter.getRc(disposable);
    }
}

@injectable()
export class DisposableFileSystemWatcherServiceFactory implements FileSystemWatcherClient {

    protected service?: FileSystemWatcherService;

    @inject(FileSystemWatcherClientRegistry)
    protected clients: FileSystemWatcherClientRegistry;

    setService(service?: FileSystemWatcherService): void {
        this.service = service;
    }

    createDisposableFileSystemWatcherService(): DisposableFileSystemWatcherService {
        return new DisposableFileSystemWatcherService(this.service!, this.clients);
    }

    onDidFilesChanged(event: DidFilesChangedParams): void {
        this.clients.forEach(event.eventId, client => {
            client.onDidFilesChanged(event);
        });
    }

    onError(event: FileSystemWatcherErrorParams): void {
        this.clients.forEach(event.eventId, client => {
            client.onError(event);
        });
    }
}

export class DisposableFileSystemWatcherService implements FileSystemWatcherService, FileSystemWatcherClient, Disposable {

    protected client?: FileSystemWatcherClient;

    protected localId = 0;
    protected handles = new Map<WatcherLocalId, { stop(): Promise<void> }>();

    constructor(
        protected service: FileSystemWatcherService,
        protected clients: FileSystemWatcherClientRegistry
    ) { }

    setClient(client?: FileSystemWatcherClient): void {
        this.client = client;
    }

    async watchFileChanges(uri: string, options?: WatchOptions): Promise<[WatcherLocalId, EventWatcherId]> {
        const localId = this.localId++;
        const [remoteId, eventId] = await this.service.watchFileChanges(uri, options);
        const clientRegistration = this.clients.registerWatcherClient(eventId, this);
        this.handles.set(localId, {
            stop: async () => {
                clientRegistration.dispose();
                await this.service.unwatchFileChanges(remoteId);
            }
        });
        return [localId, eventId];
    }

    async unwatchFileChanges(localId: number): Promise<void> {
        const handle = this.handles.get(localId);
        if (handle) {
            this.handles.delete(localId);
            await handle.stop();
        }
    }

    onDidFilesChanged(event: DidFilesChangedParams): void {
        this.client?.onDidFilesChanged(event);
    }

    onError(event: FileSystemWatcherErrorParams): void {
        this.client?.onError(event);
    }

    dispose(): void {
        this.client = undefined;
        this.handles.forEach(handle => handle.stop());
        this.handles.clear();
    }
}
