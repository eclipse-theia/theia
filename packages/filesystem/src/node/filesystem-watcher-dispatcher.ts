/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import {
    FileSystemWatcherClient, FileSystemWatcherServiceClient,
    DidFilesChangedParams, FileSystemWatcherErrorParams
} from '../common/filesystem-watcher-protocol';

/**
 * This component routes watch events to the right clients.
 */
@injectable()
export class FileSystemWatcherServiceDispatcher implements FileSystemWatcherServiceClient {

    /**
     * Mapping of `clientId` to actual clients.
     */
    protected readonly clients = new Map<number, FileSystemWatcherClient>();

    onDidFilesChanged(event: DidFilesChangedParams): void {
        for (const client of this.iterRegisteredClients(event.clients)) {
            client.onDidFilesChanged(event);
        }
    }

    onError(event: FileSystemWatcherErrorParams): void {
        for (const client of this.iterRegisteredClients(event.clients)) {
            client.onError();
        }
    }

    /**
     * Listen for events targeted at `clientId`.
     */
    registerClient(clientId: number, client: FileSystemWatcherClient): void {
        if (this.clients.has(clientId)) {
            console.warn(`FileSystemWatcherServer2Dispatcher: a client was already registered! clientId=${clientId}`);
        }
        this.clients.set(clientId, client);
    }

    unregisterClient(clientId: number): void {
        if (!this.clients.has(clientId)) {
            console.warn(`FileSystemWatcherServer2Dispatcher: tried to remove unknown client! clientId=${clientId}`);
        }
        this.clients.delete(clientId);
    }

    /**
     * Only yield registered clients for the given `clientIds`.
     *
     * If clientIds is empty, will return all clients.
     */
    protected *iterRegisteredClients(clientIds?: number[]): Iterable<FileSystemWatcherClient> {
        if (!Array.isArray(clientIds) || clientIds.length === 0) {
            // If we receive an event targeted to "no client",
            // interpret that as notifying all clients:
            yield* this.clients.values();
        } else {
            for (const clientId of clientIds) {
                const client = this.clients.get(clientId);
                if (client !== undefined) {
                    yield client;
                }
            }
        }
    }
}
