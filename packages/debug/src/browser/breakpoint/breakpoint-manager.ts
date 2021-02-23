/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser';
import { Marker } from '@theia/markers/lib/common/marker';
import { MarkerManager } from '@theia/markers/lib/browser/marker-manager';
import URI from '@theia/core/lib/common/uri';
import { SourceBreakpoint, BREAKPOINT_KIND, ExceptionBreakpoint, FunctionBreakpoint, BaseBreakpoint } from './breakpoint-marker';

export interface BreakpointsChangeEvent<T extends BaseBreakpoint> {
    uri: URI
    added: T[]
    removed: T[]
    changed: T[]
}
export type SourceBreakpointsChangeEvent = BreakpointsChangeEvent<SourceBreakpoint>;
export type FunctionBreakpointsChangeEvent = BreakpointsChangeEvent<FunctionBreakpoint>;

@injectable()
export class BreakpointManager extends MarkerManager<SourceBreakpoint> {

    static EXCEPTION_URI = new URI('debug:exception://');

    static FUNCTION_URI = new URI('debug:function://');

    protected readonly owner = 'breakpoint';

    @inject(StorageService)
    protected readonly storage: StorageService;

    getKind(): string {
        return BREAKPOINT_KIND;
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<SourceBreakpointsChangeEvent>();
    readonly onDidChangeBreakpoints = this.onDidChangeBreakpointsEmitter.event;

    protected readonly onDidChangeFunctionBreakpointsEmitter = new Emitter<FunctionBreakpointsChangeEvent>();
    readonly onDidChangeFunctionBreakpoints = this.onDidChangeFunctionBreakpointsEmitter.event;

    setMarkers(uri: URI, owner: string, newMarkers: SourceBreakpoint[]): Marker<SourceBreakpoint>[] {
        const result = super.setMarkers(uri, owner, newMarkers);
        const added: SourceBreakpoint[] = [];
        const removed: SourceBreakpoint[] = [];
        const changed: SourceBreakpoint[] = [];
        const oldMarkers = new Map(result.map(({ data }) => [data.id, data] as [string, SourceBreakpoint]));
        const ids = new Set<string>();
        for (const newMarker of newMarkers) {
            ids.add(newMarker.id);
            if (oldMarkers.has(newMarker.id)) {
                changed.push(newMarker);
            } else {
                added.push(newMarker);
            }
        }
        for (const [id, data] of oldMarkers.entries()) {
            if (!ids.has(id)) {
                removed.push(data);
            }
        }
        this.onDidChangeBreakpointsEmitter.fire({ uri, added, removed, changed });
        return result;
    }

    getLineBreakpoints(uri: URI, line: number): SourceBreakpoint[] {
        return this.findMarkers({
            uri,
            dataFilter: breakpoint => breakpoint.raw.line === line
        }).map(({ data }) => data);
    }

    getInlineBreakpoint(uri: URI, line: number, column: number): SourceBreakpoint | undefined {
        const marker = this.findMarkers({
            uri,
            dataFilter: breakpoint => breakpoint.raw.line === line && breakpoint.raw.column === column
        })[0];
        return marker && marker.data;
    }

    getBreakpoints(uri?: URI): SourceBreakpoint[] {
        return this.findMarkers({ uri }).map(marker => marker.data);
    }

    setBreakpoints(uri: URI, breakpoints: SourceBreakpoint[]): void {
        this.setMarkers(uri, this.owner, breakpoints.sort((a, b) => (a.raw.line - b.raw.line) || ((a.raw.column || 0) - (b.raw.column || 0))));
    }

    addBreakpoint(breakpoint: SourceBreakpoint): boolean {
        const uri = new URI(breakpoint.uri);
        const breakpoints = this.getBreakpoints(uri);
        const newBreakpoints = breakpoints.filter(({ raw }) => !(raw.line === breakpoint.raw.line && raw.column === breakpoint.raw.column));
        if (breakpoints.length === newBreakpoints.length) {
            newBreakpoints.push(breakpoint);
            this.setBreakpoints(uri, newBreakpoints);
            return true;
        }
        return false;
    }

    enableAllBreakpoints(enabled: boolean): void {
        for (const uriString of this.getUris()) {
            let didChange = false;
            const uri = new URI(uriString);
            const markers = this.findMarkers({ uri });
            for (const marker of markers) {
                if (marker.data.enabled !== enabled) {
                    marker.data.enabled = enabled;
                    didChange = true;
                }
            }
            if (didChange) {
                this.fireOnDidChangeMarkers(uri);
            }
        }
        let didChangeFunction = false;
        for (const breakpoint of this.getFunctionBreakpoints()) {
            if (breakpoint.enabled !== enabled) {
                breakpoint.enabled = enabled;
                didChangeFunction = true;

            }
        }
        if (didChangeFunction) {
            this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);
        }
    }

    protected _breakpointsEnabled = true;
    get breakpointsEnabled(): boolean {
        return this._breakpointsEnabled;
    }
    set breakpointsEnabled(breakpointsEnabled: boolean) {
        if (this._breakpointsEnabled !== breakpointsEnabled) {
            this._breakpointsEnabled = breakpointsEnabled;
            for (const uri of this.getUris()) {
                this.fireOnDidChangeMarkers(new URI(uri));
            }
            this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);
        }
    }

    protected readonly exceptionBreakpoints = new Map<string, ExceptionBreakpoint>();

    getExceptionBreakpoint(filter: string): ExceptionBreakpoint | undefined {
        return this.exceptionBreakpoints.get(filter);
    }

    getExceptionBreakpoints(): IterableIterator<ExceptionBreakpoint> {
        return this.exceptionBreakpoints.values();
    }

    setExceptionBreakpoints(exceptionBreakpoints: ExceptionBreakpoint[]): void {
        const toRemove = new Set(this.exceptionBreakpoints.keys());
        for (const exceptionBreakpoint of exceptionBreakpoints) {
            const filter = exceptionBreakpoint.raw.filter;
            toRemove.delete(filter);
            this.exceptionBreakpoints.set(filter, exceptionBreakpoint);
        }
        for (const filter of toRemove) {
            this.exceptionBreakpoints.delete(filter);
        }
        if (toRemove.size || exceptionBreakpoints.length) {
            this.fireOnDidChangeMarkers(BreakpointManager.EXCEPTION_URI);
        }
    }

    toggleExceptionBreakpoint(filter: string): void {
        const breakpoint = this.getExceptionBreakpoint(filter);
        if (breakpoint) {
            breakpoint.enabled = !breakpoint.enabled;
            this.fireOnDidChangeMarkers(BreakpointManager.EXCEPTION_URI);
        }
    }

    protected functionBreakpoints: FunctionBreakpoint[] = [];

    getFunctionBreakpoints(): FunctionBreakpoint[] {
        return this.functionBreakpoints;
    }

    setFunctionBreakpoints(functionBreakpoints: FunctionBreakpoint[]): void {
        const oldBreakpoints = new Map(this.functionBreakpoints.map(b => [b.id, b] as [string, FunctionBreakpoint]));

        this.functionBreakpoints = functionBreakpoints;
        this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);

        const added: FunctionBreakpoint[] = [];
        const removed: FunctionBreakpoint[] = [];
        const changed: FunctionBreakpoint[] = [];
        const ids = new Set<string>();
        for (const newBreakpoint of functionBreakpoints) {
            ids.add(newBreakpoint.id);
            if (oldBreakpoints.has(newBreakpoint.id)) {
                changed.push(newBreakpoint);
            } else {
                added.push(newBreakpoint);
            }
        }
        for (const [id, breakpoint] of oldBreakpoints.entries()) {
            if (!ids.has(id)) {
                removed.push(breakpoint);
            }
        }
        this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: BreakpointManager.FUNCTION_URI, added, removed, changed });
    }

    hasBreakpoints(): boolean {
        return !!this.getUris().next().value || !!this.functionBreakpoints.length;
    }

    removeBreakpoints(): void {
        this.cleanAllMarkers();
        this.setFunctionBreakpoints([]);
    }

    async load(): Promise<void> {
        const data = await this.storage.getData<BreakpointManager.Data>('breakpoints', {
            breakpointsEnabled: true,
            breakpoints: {}
        });
        this._breakpointsEnabled = data.breakpointsEnabled;
        // eslint-disable-next-line guard-for-in
        for (const uri in data.breakpoints) {
            this.setBreakpoints(new URI(uri), data.breakpoints[uri]);
        }
        if (data.functionBreakpoints) {
            this.setFunctionBreakpoints(data.functionBreakpoints);
        }
        if (data.exceptionBreakpoints) {
            this.setExceptionBreakpoints(data.exceptionBreakpoints);
        }
    }

    save(): void {
        const data: BreakpointManager.Data = {
            breakpointsEnabled: this._breakpointsEnabled,
            breakpoints: {}
        };
        const uris = this.getUris();
        for (const uri of uris) {
            data.breakpoints[uri] = this.findMarkers({ uri: new URI(uri) }).map(marker => marker.data);
        }
        if (this.functionBreakpoints.length) {
            data.functionBreakpoints = this.functionBreakpoints;
        }
        if (this.exceptionBreakpoints.size) {
            data.exceptionBreakpoints = [...this.exceptionBreakpoints.values()];
        }
        this.storage.setData('breakpoints', data);
    }

}
export namespace BreakpointManager {
    export interface Data {
        breakpointsEnabled: boolean
        breakpoints: {
            [uri: string]: SourceBreakpoint[]
        }
        exceptionBreakpoints?: ExceptionBreakpoint[]
        functionBreakpoints?: FunctionBreakpoint[]
    }
}
