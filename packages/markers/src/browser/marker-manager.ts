/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Event, Emitter } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { Marker } from '../common/marker';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileChangeType } from '@theia/filesystem/lib/common/files';

/*
 * argument to the `findMarkers` method.
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

    get empty(): boolean {
        return !this.owner2Markers.size;
    }

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

    protected filterMarkers(filter: SearchFilter<T>, toFilter?: Marker<T>[]): Marker<T>[] {
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

export interface Uri2MarkerEntry {
    uri: string
    markers: Owner2MarkerEntry[]
}

export interface Owner2MarkerEntry {
    owner: string
    markerData: object[];
}

@injectable()
export abstract class MarkerManager<D extends object> {

    public abstract getKind(): string;

    protected readonly uri2MarkerCollection = new Map<string, MarkerCollection<D>>();
    protected readonly onDidChangeMarkersEmitter = new Emitter<URI>();

    @inject(FileService)
    protected readonly fileService: FileService;

    @postConstruct()
    protected init(): void {
        this.fileService.onDidFilesChange(event => {
            if (event.gotDeleted()) {
                this.cleanMarkers(event);
            }
        });
    }

    protected cleanMarkers(event: FileChangesEvent): void {
        for (const uriString of this.uri2MarkerCollection.keys()) {
            const uri = new URI(uriString);
            if (event.contains(uri, FileChangeType.DELETED)) {
                this.cleanAllMarkers(uri);
            }
        }
    }

    get onDidChangeMarkers(): Event<URI> {
        return this.onDidChangeMarkersEmitter.event;
    }

    protected fireOnDidChangeMarkers(uri: URI): void {
        this.onDidChangeMarkersEmitter.fire(uri);
    }

    /*
     * replaces the current markers for the given uri and owner with the given data.
     */
    setMarkers(uri: URI, owner: string, data: D[]): Marker<D>[] {
        const uriString = uri.toString();
        const collection = this.uri2MarkerCollection.get(uriString) || new MarkerCollection<D>(uri, this.getKind());
        const oldMarkers = collection.setMarkers(owner, data);
        if (collection.empty) {
            this.uri2MarkerCollection.delete(uri.toString());
        } else {
            this.uri2MarkerCollection.set(uriString, collection);
        }
        this.fireOnDidChangeMarkers(uri);
        return oldMarkers;
    }

    /*
     * returns all markers that satisfy the given filter.
     */
    findMarkers(filter: SearchFilter<D> = {}): Marker<D>[] {
        if (filter.uri) {
            const collection = this.uri2MarkerCollection.get(filter.uri.toString());
            return collection ? collection.findMarkers(filter) : [];
        }
        const result: Marker<D>[] = [];
        for (const uri of this.getUris()) {
            result.push(...this.uri2MarkerCollection.get(uri)!.findMarkers(filter));
        }
        return result;
    }

    getUris(): IterableIterator<string> {
        return this.uri2MarkerCollection.keys();
    }

    cleanAllMarkers(uri?: URI): void {
        if (uri) {
            this.doCleanAllMarkers(uri);
        } else {
            for (const uriString of this.getUris()) {
                this.doCleanAllMarkers(new URI(uriString));
            }
        }
    }
    protected doCleanAllMarkers(uri: URI): void {
        const uriString = uri.toString();
        const collection = this.uri2MarkerCollection.get(uriString);
        if (collection !== undefined) {
            this.uri2MarkerCollection.delete(uriString);
            this.fireOnDidChangeMarkers(uri);
        }
    }

}
