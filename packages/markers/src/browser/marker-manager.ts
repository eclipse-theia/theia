// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Event, Emitter } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { Marker } from '../common/marker';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileChangeType } from '@theia/filesystem/lib/common/files';
import { Filters } from './problem/problem-filter';
import { Diagnostic, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { EditorManager } from '@theia/editor/lib/browser';
import { match } from '@theia/core/lib/common/glob';
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
    protected toolbarFilters: Filters;
    protected toolbarFilterFn: (data: D, collection: MarkerCollection<D>) => boolean = () => true;
    protected readonly uri2MarkerCollection = new Map<string, MarkerCollection<D>>();
    protected readonly onDidChangeMarkersEmitter = new Emitter<URI>();

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @postConstruct()
    protected init(): void {
        this.fileService.onDidFilesChange(event => {
            if (event.gotDeleted()) {
                this.cleanMarkers(event);
            }
        });

        this.editorManager.onCurrentEditorChanged(() => {
            if (this.toolbarFilters && this.toolbarFilters.activeFile) {
                this.setFilters(this.toolbarFilters);
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
    findMarkers(filter: SearchFilter<D> = {}, enableToolbarFilters = true): Marker<D>[] {
        const dataFilter = (data: D, collection: MarkerCollection<D>) => {
            if (!enableToolbarFilters) {
                return filter.dataFilter ? filter.dataFilter(data) : true;
            }
            return filter.dataFilter ? filter.dataFilter(data) && this.toolbarFilterFn(data, collection) : this.toolbarFilterFn(data, collection);
        };
        if (filter.uri) {
            const collection = this.uri2MarkerCollection.get(filter.uri.toString());
            return collection ? collection.findMarkers({ ...filter, dataFilter: (data: D) => dataFilter(data, collection) }) : [];
        }
        const result: Marker<D>[] = [];
        for (const uri of this.getUris()) {
            const collection = this.uri2MarkerCollection.get(uri)!;
            result.push(...collection.findMarkers({ ...filter, dataFilter: (data: D) => dataFilter(data, collection) }));
        }
        return result;
    }

    getMarkersByUri(): IterableIterator<[string, MarkerCollection<D>]> {
        return this.uri2MarkerCollection.entries();
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

    getToolbarFilters(): Filters | undefined {
        return this.toolbarFilters;
    }

    setFilters(filters: Filters): void {
        const { text, showErrors, showWarnings, showInfos, showHints, activeFile, useFilesExclude } = filters;
        this.toolbarFilters = filters;
        const markfilterFns: Array<(data: D, collection?: MarkerCollection<D>) => boolean> = [];

        if (!showErrors) {
            markfilterFns.push((data: D): boolean => (data as Diagnostic).severity !== DiagnosticSeverity.Error);
        }
        if (!showWarnings) {
            markfilterFns.push((data: D) => (data as Diagnostic).severity !== DiagnosticSeverity.Warning);
        }
        if (!showInfos) {
            markfilterFns.push((data: D) => (data as Diagnostic).severity !== DiagnosticSeverity.Information);
        }

        if (!showHints) {
            markfilterFns.push((data: D) => (data as Diagnostic).severity !== DiagnosticSeverity.Hint);
        }

        if (activeFile) {
            markfilterFns.push((data: D, collection: MarkerCollection<D>) => {
                const editor = this.editorManager.currentEditor;
                if (editor) {
                    const uri = editor.getResourceUri();
                    return collection.uri.path.toString() === uri?.path.toString();
                }
                return true;
            });
        }

        if (text) {
            const startWithExclude = text.startsWith('!');
            let filterText = text.replace(/^!/, '').replace(/\/$/, '');
            if (filterText[0] === '.') {
                filterText = '*' + filterText; // convert ".js" to "*.js"
            }

            if (startWithExclude !== useFilesExclude) {
                markfilterFns.push((data: D, collection: MarkerCollection<D>) => !((data as Diagnostic).message.toLowerCase().includes(text.replace(/^!/, '').toLowerCase()) ||
                    [`**/${filterText}`, `**/${filterText}/**`].some((t: string) => match(t, collection.uri.path.toString()))));
            } else {

                markfilterFns.push((data: D, collection: MarkerCollection<D>) => (data as Diagnostic).message.toLowerCase().includes(text.replace(/^!/, '').toLowerCase()) ||
                    [`**/${filterText}`, `**/${filterText}/**`].some((t: string) => match(t, collection.uri.path.toString())));
            }
        }

        this.toolbarFilterFn = (data: D, collection: MarkerCollection<D>) => markfilterFns.every(filter => filter(data, collection));

        for (const uriString of this.getUris()) {
            this.fireOnDidChangeMarkers(new URI(uriString));
        }
    }
}
