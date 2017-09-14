/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { Disposable, Event, Emitter } from "@theia/core/lib/common";
import URI from "@theia/core/lib/common/uri";

/*
 * A marker represents meta information for a given uri
 */
export interface Marker<T> {
    /**
     * the uri this marker is associated with.
     */
    uri: string;
    /*
     * the owner of this marker. Any string provided by the registrar.
     */
    owner: string;

    /**
     * the kind, e.g. 'problem'
     */
    kind?: string;

    /*
     * marker kind specfic data
     */
    data: T;
}

/*
 * argument to the `findMarkes` method.
 */
export interface SearchFilter<D> {
    uri?: URI,
    owner?: string,
    dataFilter?: (data: D) => boolean
}

export class MarkerCollection<T> implements Disposable {

    protected readonly owner2Markers = new Map<string, Readonly<Marker<T>>[]>();

    constructor(
        public readonly uri: URI,
        public readonly kind: string,
        protected readonly onDispose: () => void,
        protected readonly onChange: () => void
    ) { }

    dispose(): void {
        this.onDispose();
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
        this.onChange();
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

@injectable()
export abstract class MarkerManager<D extends object> {

    public abstract getKind(): string;

    protected readonly uri2MarkerCollection = new Map<string, MarkerCollection<D>>();
    protected readonly onDidChangeMarkersEmitter = new Emitter<void>();

    get onDidChangeMarkers(): Event<void> {
        return this.onDidChangeMarkersEmitter.event;
    }

    protected fireOnDidChangeMarkers(): void {
        this.onDidChangeMarkersEmitter.fire(undefined);
    }

    /*
     * replaces the current markers for the given uri and owner with the given data.
     */
    setMarkers(uri: URI, owner: string, data: D[]): Marker<D>[] {
        const collection = this.getCollection(uri);
        return collection.setMarkers(owner, data);
    }

    protected getCollection(uri: URI): MarkerCollection<D> {
        let collection: MarkerCollection<D>;
        const uriString = uri.toString();
        if (this.uri2MarkerCollection.has(uriString)) {
            collection = this.uri2MarkerCollection.get(uriString)!;
        } else {
            collection = new MarkerCollection<D>(uri, this.getKind(), () => this.uri2MarkerCollection.delete(uriString), () => this.fireOnDidChangeMarkers());
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
