/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as theia from '@theia/plugin';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { convertDiagnosticToMarkerData } from '../type-converters';
import { DiagnosticSeverity, MarkerSeverity } from '../types-impl';
import { MarkerData } from '../../common/plugin-api-rpc-model';
import { RPCProtocol } from '../../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT, LanguagesMain } from '../../common/plugin-api-rpc';
import { URI } from '@theia/core/shared/vscode-uri';
import { v4 } from 'uuid';

export class DiagnosticCollection implements theia.DiagnosticCollection {
    private static DIAGNOSTICS_PRIORITY = [
        DiagnosticSeverity.Error, DiagnosticSeverity.Warning, DiagnosticSeverity.Information, DiagnosticSeverity.Hint
    ];

    private collectionName: string;
    private diagnosticsLimitPerResource: number;
    private proxy: LanguagesMain;
    private onDidChangeDiagnosticsEmitter: Emitter<theia.DiagnosticChangeEvent>;

    private diagnostics: Map<string, theia.Diagnostic[]>; // uri -> diagnostics
    private isDisposed: boolean;
    private onDisposeCallback: (() => void) | undefined;

    constructor(name: string, maxCountPerFile: number, proxy: LanguagesMain, onDidChangeDiagnosticsEmitter: Emitter<theia.DiagnosticChangeEvent>) {
        this.collectionName = name;
        this.diagnosticsLimitPerResource = maxCountPerFile;
        this.proxy = proxy;
        this.onDidChangeDiagnosticsEmitter = onDidChangeDiagnosticsEmitter;

        this.diagnostics = new Map<string, theia.Diagnostic[]>();
        this.isDisposed = false;
        this.onDisposeCallback = undefined;
    }

    get name(): string {
        return this.collectionName;
    }

    set(uri: theia.Uri, diagnostics: theia.Diagnostic[] | undefined): void;
    set(entries: [theia.Uri, theia.Diagnostic[] | undefined][]): void;
    set(arg: theia.Uri | [theia.Uri, theia.Diagnostic[] | undefined][], diagnostics?: theia.Diagnostic[] | undefined): void {
        this.ensureNotDisposed();

        if (arg instanceof URI) {
            this.setDiagnosticsForUri(arg, diagnostics);
        } else if (!arg) {
            this.clear();
        } else if (arg instanceof Array) {
            this.setDiagnostics(arg);
        }
    }

    private setDiagnosticsForUri(uri: URI, diagnostics?: theia.Diagnostic[]): void {
        if (!diagnostics) {
            this.diagnostics.delete(uri.toString());
        } else {
            this.diagnostics.set(uri.toString(), diagnostics);
        }
        this.fireDiagnosticChangeEvent(uri);
        this.sendChangesToEditor([uri]);
    }

    private setDiagnostics(entries: [URI, theia.Diagnostic[] | undefined][]): void {
        const delta: URI[] = [];

        // clear old diagnostics for given resources
        for (const [uri] of entries) {
            this.diagnostics.delete(uri.toString());
        }

        for (const [uri, diagnostics] of entries) {
            const uriString = uri.toString();

            if (!diagnostics) {
                // clear existed
                this.diagnostics.delete(uriString);
                delta.push(uri);
            } else {
                // merge with existed if any
                const existedDiagnostics = this.diagnostics.get(uriString);
                if (existedDiagnostics) {
                    existedDiagnostics.push(...diagnostics);
                } else {
                    this.diagnostics.set(uriString, diagnostics);
                }
            }

            if (delta.indexOf(uri) === -1) {
                delta.push(uri);
            }
        }

        this.fireDiagnosticChangeEvent(delta);
        this.sendChangesToEditor(delta);
    }

    delete(uri: URI): void {
        if (this.has(uri)) {
            this.fireDiagnosticChangeEvent(uri);
            this.diagnostics.delete(uri.toString());
            this.proxy.$changeDiagnostics(this.name, [[uri.toString(), []]]);
        }
    }

    clear(): void {
        this.ensureNotDisposed();
        this.fireDiagnosticChangeEvent(this.getAllResourcesUris());
        this.diagnostics.clear();
        this.proxy.$clearDiagnostics(this.name);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forEach(callback: (uri: URI, diagnostics: theia.Diagnostic[], collection: theia.DiagnosticCollection) => any, thisArg?: any): void {
        this.ensureNotDisposed();
        this.diagnostics.forEach((diagnostics, uriString) => {
            const uri = URI.parse(uriString);
            callback.apply(thisArg, [uri, this.getDiagnosticsByUri(uri), this]);
        });
    }

    get(uri: URI): theia.Diagnostic[] | undefined {
        this.ensureNotDisposed();
        return this.getDiagnosticsByUri(uri);
    }

    has(uri: URI): boolean {
        this.ensureNotDisposed();
        return (this.diagnostics.get(uri.toString()) instanceof Array);
    }

    dispose(): void {
        if (!this.isDisposed) {
            if (this.onDisposeCallback) {
                this.onDisposeCallback();
            }
            this.clear();
            this.isDisposed = true;
        }
    }

    setOnDisposeCallback(onDisposeCallback: (() => void) | undefined): void {
        this.onDisposeCallback = onDisposeCallback;
    }

    private ensureNotDisposed(): void {
        if (this.isDisposed) {
            throw new Error('Diagnostic collection with name "' + this.name + '" is already disposed.');
        }
    }

    private getAllResourcesUris(): string[] {
        const resourcesUris: string[] = [];
        this.diagnostics.forEach((diagnostics, uri) => resourcesUris.push(uri));
        return resourcesUris;
    }

    private getDiagnosticsByUri(uri: URI): theia.Diagnostic[] | undefined {
        const diagnostics = this.diagnostics.get(uri.toString());
        return (diagnostics instanceof Array) ? <theia.Diagnostic[]>Object.freeze(diagnostics) : undefined;
    }

    private fireDiagnosticChangeEvent(arg: string | string[] | URI | URI[]): void {
        this.onDidChangeDiagnosticsEmitter.fire({ uris: this.toUrisArray(arg) });
    }

    private toUrisArray(arg: string | string[] | URI | URI[]): URI[] {
        if (arg instanceof Array) {
            if (arg.length === 0) {
                return [];
            }

            if (arg[0] instanceof URI) {
                return arg as URI[];
            } else {
                const result: URI[] = [];
                for (const uriString of arg as string[]) {
                    result.push(URI.parse(uriString));
                }
                return result;
            }
        } else {
            if (arg instanceof URI) {
                return [arg];
            } else {
                return [URI.parse(arg)];
            }
        }
    }

    private sendChangesToEditor(uris: URI[]): void {
        const markers: [string, MarkerData[]][] = [];
        nextUri:
        for (const uri of uris) {
            const uriMarkers: MarkerData[] = [];
            const uriDiagnostics = this.diagnostics.get(uri.toString());
            if (uriDiagnostics) {
                if (uriDiagnostics.length > this.diagnosticsLimitPerResource) {
                    for (const severity of DiagnosticCollection.DIAGNOSTICS_PRIORITY) {
                        for (const diagnostic of uriDiagnostics) {
                            if (severity === diagnostic.severity) {
                                if (uriMarkers.push(convertDiagnosticToMarkerData(diagnostic)) + 1 === this.diagnosticsLimitPerResource) {
                                    const lastMarker = uriMarkers[uriMarkers.length - 1];
                                    uriMarkers.push({
                                        severity: MarkerSeverity.Info,
                                        message: 'Limit of diagnostics is reached. ' + (uriDiagnostics.length - this.diagnosticsLimitPerResource) + ' items are hidden',
                                        startLineNumber: lastMarker.startLineNumber,
                                        startColumn: lastMarker.startColumn,
                                        endLineNumber: lastMarker.endLineNumber,
                                        endColumn: lastMarker.endColumn
                                    });
                                    markers.push([uri.toString(), uriMarkers]);
                                    continue nextUri;
                                }
                            }
                        }
                    }
                } else {
                    uriDiagnostics.forEach(diagnostic => uriMarkers.push(convertDiagnosticToMarkerData(diagnostic)));
                    markers.push([uri.toString(), uriMarkers]);
                }
            } else {
                markers.push([uri.toString(), []]);
            }
        }

        this.proxy.$changeDiagnostics(this.name, markers);
    }
}

export class Diagnostics {
    public static MAX_DIAGNOSTICS_PER_FILE = 1000;
    private static GENERATED_DIAGNOSTIC_COLLECTION_NAME_PREFIX = '_generated_diagnostic_collection_name_#';

    private proxy: LanguagesMain;
    private diagnosticCollections: Map<string, DiagnosticCollection>; // id -> diagnostic collection

    private diagnosticsChangedEmitter = new Emitter<theia.DiagnosticChangeEvent>();
    public readonly onDidChangeDiagnostics: Event<theia.DiagnosticChangeEvent> = this.diagnosticsChangedEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.LANGUAGES_MAIN);

        this.diagnosticCollections = new Map<string, DiagnosticCollection>();
    }

    getDiagnostics(resource: theia.Uri): theia.Diagnostic[];
    getDiagnostics(): [theia.Uri, theia.Diagnostic[]][];
    getDiagnostics(resource?: URI): theia.Diagnostic[] | [URI, theia.Diagnostic[]][] {
        if (resource) {
            return this.getAllDiagnosticsForResource(resource);
        } else {
            return this.getAllDiagnostics();
        }
    }

    createDiagnosticCollection(name?: string): theia.DiagnosticCollection {
        if (!name) {
            do {
                name = Diagnostics.GENERATED_DIAGNOSTIC_COLLECTION_NAME_PREFIX + this.getNextId();
            } while (this.diagnosticCollections.has(name));
        } else if (this.diagnosticCollections.has(name)) {
            console.warn(`Diagnostic collection with name '${name}' already exist.`);
        }

        const diagnosticCollection = new DiagnosticCollection(name, Diagnostics.MAX_DIAGNOSTICS_PER_FILE, this.proxy, this.diagnosticsChangedEmitter);
        diagnosticCollection.setOnDisposeCallback(() => {
            this.diagnosticCollections.delete(name!);
        });
        this.diagnosticCollections.set(name, diagnosticCollection);
        return diagnosticCollection;
    }

    private getNextId(): string {
        return v4();
    }

    private getAllDiagnosticsForResource(uri: URI): theia.Diagnostic[] {
        let result: theia.Diagnostic[] = [];
        this.diagnosticCollections.forEach(diagnosticCollection => {
            const diagnostics = diagnosticCollection.get(uri);
            if (diagnostics) {
                result = result.concat(...diagnostics);
            }
        });
        return result;
    }

    private getAllDiagnostics(): [URI, theia.Diagnostic[]][] {
        const result: [URI, theia.Diagnostic[]][] = [];
        // Holds uri index in result array of tuples.
        const urisIndexes = new Map<string, number>();
        let nextIndex = 0;
        this.diagnosticCollections.forEach(diagnosticsCollection =>
            diagnosticsCollection.forEach((uri, diagnostics) => {
                let uriIndex = urisIndexes.get(uri.toString());
                if (uriIndex === undefined) {
                    uriIndex = nextIndex++;
                    urisIndexes.set(uri.toString(), uriIndex);
                    result.push([uri, [...diagnostics]]);
                } else {
                    result[uriIndex][1] = result[uriIndex][1].concat(...diagnostics);
                }
            })
        );
        return result;
    }

}
