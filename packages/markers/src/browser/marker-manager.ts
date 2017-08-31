/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Disposable, Event, Emitter } from "@theia/core/lib/common";
import { JSONExt } from "@phosphor/coreutils";

export interface Marker<T> {
    id: string;
    uri: string;
    owner: string;
    kind: string;
    data: T;
}

export interface MarkerInfo {
    counter: number;
    uri: string
}

export class MarkerCollection<T> implements Disposable {

    protected readonly markers = new Map<string, Readonly<Marker<T>>[]>();
    protected readonly idSequences = new Map<string, number>();

    constructor(
        public readonly owner: string,
        public readonly kind: string,
        protected readonly fireDispose: () => void,
        protected readonly fireChange: () => void
    ) { }

    dispose(): void {
        this.fireDispose();
    }

    get uris(): string[] {
        return Array.from(this.markers.keys());
    }

    getMarkers(uri: string): Readonly<Marker<T>>[] {
        return this.markers.get(uri) || [];
    }

    setMarkers(uri: string, markerData: T[]): void {
        if (markerData.length > 0) {
            this.markers.set(uri, markerData.map(data => this.createMarker(uri, data)));
        } else {
            this.markers.delete(uri);
        }
        this.fireChange();
    }

    protected createMarker(uri: string, data: T): Readonly<Marker<T>> {
        let id;
        const marker = this.getMarkers(uri).find((m: Marker<T>) => JSONExt.deepEqual((m.data as any), (data as any)));
        if (marker) {
            id = marker.id;
        } else {
            id = `${this.owner}_${uri}_${this.nextId(uri)}`;
        }
        return Object.freeze({
            uri,
            kind: this.kind,
            owner: this.owner,
            id,
            data
        });
    }

    protected nextId(uri: string): number {
        const id = this.idSequences.get(uri) || 0;
        this.idSequences.set(uri, id + 1);
        return id;
    }

}

@injectable()
export class MarkerManager {

    protected readonly owners = new Map<string, MarkerCollection<object>>();
    protected readonly onDidChangeMarkersEmitter = new Emitter<void>();

    get onDidChangeMarkers(): Event<void> {
        return this.onDidChangeMarkersEmitter.event;
    }
    protected fireOnDidChangeMarkers(): void {
        this.onDidChangeMarkersEmitter.fire(undefined);
    }

    createCollection<T extends object>(owner: string, kind: string): MarkerCollection<T> {
        if (this.owners.has(owner)) {
            throw new Error('marker collection for the given owner already exists, owner: ' + owner);
        }
        const collection = new MarkerCollection<T>(owner, kind, () => this.deleteCollection(owner), () => this.fireOnDidChangeMarkers());
        this.owners.set(owner, collection);
        return collection;
    }

    protected deleteCollection(owner: string): void {
        this.owners.delete(owner);
    }

    protected forEachByKind(kind: string, cb: (mc: MarkerCollection<Object>) => void): void {
        this.owners.forEach(collection => {
            if (collection.kind === kind) {
                cb(collection);
            }
        });
    }

    forEachMarkerInfoByKind(kind: string, cb: (markerInfo: MarkerInfo) => void): void {
        this.forEachByKind(kind, collection => collection.uris.forEach(uri => {
            const markers = collection.getMarkers(uri);
            cb({
                uri: uri,
                counter: markers.length
            });
        }));
    }

    forEachMarkerByUriAndKind(uri: string, kind: string, cb: (marker: Readonly<Marker<Object>>) => void): void {
        this.forEachByKind(kind, collection => collection.getMarkers(uri).forEach(m => cb(m)));
    }
}
