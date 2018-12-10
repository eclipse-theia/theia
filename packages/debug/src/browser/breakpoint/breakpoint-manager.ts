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

import { injectable, inject } from 'inversify';
import { Emitter, Event } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser';
import { Marker } from '@theia/markers/lib/common/marker';
import { MarkerManager } from '@theia/markers/lib/browser/marker-manager';
import URI from '@theia/core/lib/common/uri';
import { SourceBreakpoint, BREAKPOINT_KIND } from './breakpoint-marker';

export interface BreakpointsChangeEvent {
    uri: URI
    added: SourceBreakpoint[]
    removed: SourceBreakpoint[]
    changed: SourceBreakpoint[]
}

@injectable()
export class BreakpointManager extends MarkerManager<SourceBreakpoint> {

    protected readonly owner = 'breakpoint';

    @inject(StorageService)
    protected readonly storage: StorageService;

    getKind(): string {
        return BREAKPOINT_KIND;
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<BreakpointsChangeEvent>();
    readonly onDidChangeBreakpoints: Event<BreakpointsChangeEvent> = this.onDidChangeBreakpointsEmitter.event;

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

    getBreakpoint(uri: URI, line: number): SourceBreakpoint | undefined {
        const marker = this.findMarkers({
            uri,
            dataFilter: breakpoint => breakpoint.raw.line === line
        })[0];
        return marker && marker.data;
    }

    getBreakpoints(uri?: URI): SourceBreakpoint[] {
        return this.findMarkers({ uri }).map(marker => marker.data);
    }

    setBreakpoints(uri: URI, breakpoints: SourceBreakpoint[]): void {
        this.setMarkers(uri, this.owner, breakpoints.sort((a, b) => a.raw.line - b.raw.line));
    }

    addBreakpoint(breakpoint: SourceBreakpoint): boolean {
        const uri = new URI(breakpoint.uri);
        const breakpoints = this.getBreakpoints(uri);
        const newBreakpoints = breakpoints.filter(({ raw }) => raw.line !== breakpoint.raw.line);
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
        }
    }

    async load(): Promise<void> {
        const data = await this.storage.getData<BreakpointManager.Data>('breakpoints', {
            breakpointsEnabled: true,
            breakpoints: {}
        });
        this._breakpointsEnabled = data.breakpointsEnabled;
        // tslint:disable-next-line:forin
        for (const uri in data.breakpoints) {
            this.setBreakpoints(new URI(uri), data.breakpoints[uri]);
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
        this.storage.setData('breakpoints', data);
    }

}
export namespace BreakpointManager {
    export interface Data {
        breakpointsEnabled: boolean
        breakpoints: {
            [uri: string]: SourceBreakpoint[]
        }
    }
}
