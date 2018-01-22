/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Event, Emitter } from "@theia/core/lib/common";
import URI from "@theia/core/lib/common/uri";
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { FileSystemWatcher, FileChangeType } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { Marker } from '../common/marker';

/*
 * argument to the `findMarkes` method.
 */
export interface SearchFilter<D> {
    uri?: URI,
    owner?: string,
    dataFilter?: (data: D) => boolean
}

export class MarkerCollection<T> {

    protected readonly owner2Markers = new Map<string, Readonly<Marker<T>>[]>();

    constructor(
        public readonly uri: URI,
        public readonly kind: string
    ) { }

    getOwners(): string[] {
        return Array.from(this.owner2Markers.keys());
    }

    getMarkers(owner: string): Readonly<Marker<T>>[] {
        return this.owner2Markers.get(owner) || [];
    }

    setMarkers(owner: string, markerData: T[]): Marker<T>[] {
        const before = this.owner2Markers.get(owner);
        if (markerData.length > 0) {
            this.owner2Markers.set(owner, markerData.map(data => this.createMarker(owner, data)));
        } else {
            this.owner2Markers.delete(owner);
        }
        return before || [];
    }

    protected createMarker(owner: string, data: T): Readonly<Marker<T>> {
        return Object.freeze({
            uri: this.uri.toString(),
            kind: this.kind,
            owner: owner,
            data
        });
    }

    findMarkers(filter: SearchFilter<T>): Marker<T>[] {
        if (filter.owner) {
            if (this.owner2Markers.has(filter.owner)) {
                return this.filterMarkers(filter, this.owner2Markers.get(filter.owner));
            }
            return [];
        } else {
            const result: Marker<T>[] = [];
            for (const markers of this.owner2Markers.values()) {
                result.push(...this.filterMarkers(filter, markers));
            }
            return result;
        }
    }

    protected filterMarkers(filter: SearchFilter<T>, toFilter?: Marker<T>[]) {
        if (!toFilter) {
            return [];
        }
        if (filter.dataFilter) {
            return toFilter.filter(d => filter.dataFilter!(d.data));
        } else {
            return toFilter;
        }
    }

}

interface Uri2MarkerEntry {
    uri: string
    markers: Owner2MarkerEntry[]
}

interface Owner2MarkerEntry {
    owner: string
    markerData: object[];
}

@injectable()
export abstract class MarkerManager<D extends object> {

    public abstract getKind(): string;

    protected readonly uri2MarkerCollection = new Map<string, MarkerCollection<D>>();
    protected readonly onDidChangeMarkersEmitter = new Emitter<void>();
    readonly initialized: Promise<void>;

    constructor(
        @inject(StorageService) protected storageService: StorageService,
        @inject(FileSystemWatcher) protected fileWatcher?: FileSystemWatcher) {
        this.initialized = this.loadMarkersFromStorage();
        if (fileWatcher) {
            fileWatcher.onFilesChanged(changes => {
                for (const change of changes) {
                    if (change.type === FileChangeType.DELETED) {
                        const uriString = change.uri.toString();
                        const collection = this.uri2MarkerCollection.get(uriString);
                        if (collection !== undefined) {
                            this.uri2MarkerCollection.delete(uriString);
                            this.fireOnDidChangeMarkers();
                        }
                    }
                }
            });
        }
    }

    protected getStorageKey(): string | undefined {
        return 'marker-' + this.getKind();
    }

    protected async loadMarkersFromStorage(): Promise<void> {
        const key = this.getStorageKey();
        if (key) {
            const entries = await this.storageService.getData<Uri2MarkerEntry[]>(key, []);
            for (const entry of entries) {
                for (const ownerEntry of entry.markers) {
                    this.internalSetMarkers(new URI(entry.uri), ownerEntry.owner, ownerEntry.markerData as D[]);
                }
            }
            this.onDidChangeMarkers(() => this.saveMarkersToStorage());
        }
    }

    protected saveMarkersToStorage() {
        const key = this.getStorageKey();
        if (key) {
            const result: Uri2MarkerEntry[] = [];
            for (const [uri, collection] of this.uri2MarkerCollection.entries()) {
                const ownerEntries: Owner2MarkerEntry[] = [];
                for (const owner of collection.getOwners()) {
                    const marker = collection.getMarkers(owner);
                    if (marker) {
                        ownerEntries.push({
                            owner,
                            markerData: Array.from(marker.map(m => m.data))
                        });
                    }
                }
                result.push({
                    uri,
                    markers: ownerEntries
                });
            }
            this.storageService.setData<Uri2MarkerEntry[]>(key, result);
        }
    }

    get onDidChangeMarkers(): Event<void> {
        return this.onDidChangeMarkersEmitter.event;
    }

    protected fireOnDidChangeMarkers(): void {
        this.onDidChangeMarkersEmitter.fire(undefined);
    }

    /*
     * replaces the current markers for the given uri and owner with the given data.
     */
    async setMarkers(uri: URI, owner: string, data: D[]): Promise<Marker<D>[]> {
        await this.initialized;
        return this.internalSetMarkers(uri, owner, data);
    }

    protected internalSetMarkers(uri: URI, owner: string, data: D[]): Marker<D>[] {
        const collection = this.getCollection(uri);
        const result = collection.setMarkers(owner, data);
        this.fireOnDidChangeMarkers();
        return result;
    }

    protected getCollection(uri: URI): MarkerCollection<D> {
        let collection: MarkerCollection<D>;
        const uriString = uri.toString();
        if (this.uri2MarkerCollection.has(uriString)) {
            collection = this.uri2MarkerCollection.get(uriString)!;
        } else {
            collection = new MarkerCollection<D>(uri, this.getKind());
            this.uri2MarkerCollection.set(uriString, collection);
        }
        return collection;
    }

    /*
     * returns all markers that satisfy the given filter.
     */
    findMarkers(filter: SearchFilter<D> = {}): Marker<D>[] {
        if (filter.uri) {
            return this.getCollection(filter.uri)!.findMarkers(filter);
        } else {
            const result: Marker<D>[] = [];
            for (const uri of this.getUris()) {
                result.push(...this.getCollection(new URI(uri))!.findMarkers(filter));
            }
            return result;
        }
    }

    getUris(): Iterable<string> {
        return this.uri2MarkerCollection.keys();
    }

}
