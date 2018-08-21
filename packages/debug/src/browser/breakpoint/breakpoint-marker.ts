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

import { injectable } from 'inversify';
import { ExtDebugProtocol } from '../../common/debug-common';
import { DebugUtils } from '../debug-utils';
import { MarkerManager } from '@theia/markers/lib/browser/marker-manager';
import URI from '@theia/core/lib/common/uri';
import { Marker } from '@theia/markers/lib/common/marker';

export const BREAKPOINT_KIND = 'breakpoint';
const BREAKPOINT_OWNER = 'breakpoint';

export interface BreakpointMarker extends Marker<ExtDebugProtocol.AggregatedBreakpoint> {
    kind: 'breakpoint'
}

export namespace BreakpointMarker {
    export function is(node: Marker<object>): node is BreakpointMarker {
        return 'kind' in node && node.kind === BREAKPOINT_KIND;
    }
}

@injectable()
export class BreakpointStorage extends MarkerManager<ExtDebugProtocol.AggregatedBreakpoint> {

    public getKind(): string {
        return BREAKPOINT_KIND;
    }

    /**
     * Updates an existed breakpoint.
     * @param breakpoint the breakpoint to update
     */
    update(data: ExtDebugProtocol.AggregatedBreakpoint | ExtDebugProtocol.AggregatedBreakpoint[]): void {
        const breakpoints = Array.isArray(data) ? data : [data];

        breakpoints.map(breakpoint => {
            const uri = this.toUri(breakpoint);
            const id = DebugUtils.makeBreakpointId(breakpoint);

            const newBreakpoints = super.findMarkers({ uri }).map(m => DebugUtils.makeBreakpointId(m.data) === id ? breakpoint : m.data);
            super.setMarkers(uri, BREAKPOINT_OWNER, newBreakpoints);
        });
    }

    /**
     * Adds a given breakpoint.
     * @param breakpoint the breakpoint to add
     */
    add(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): void {
        const uri = this.toUri(breakpoint);
        const existedBreakpoints = super.findMarkers({ uri }).map(m => m.data);
        existedBreakpoints.push(breakpoint);
        super.setMarkers(uri, BREAKPOINT_OWNER, existedBreakpoints);
    }

    /**
     * Deletes a given breakpoint.
     * @param breakpoint the breakpoint to delete
     */
    delete(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): void {
        const uri = this.toUri(breakpoint);

        const id = DebugUtils.makeBreakpointId(breakpoint);
        const breakpoints = super.findMarkers({ uri, dataFilter: b => DebugUtils.makeBreakpointId(b) !== id }).map(m => m.data);

        super.setMarkers(uri, BREAKPOINT_OWNER, breakpoints);
    }

    /**
     * Gets breakpoints by the given criteria.
     * @param dataFilter the filter
     * @returns the list of breakpoints
     */
    get(dataFilter?: (breakpoint: ExtDebugProtocol.AggregatedBreakpoint) => boolean): ExtDebugProtocol.AggregatedBreakpoint[] {
        return super.findMarkers({ dataFilter }).map(m => m.data);
    }

    /**
     * Indicates if breakpoint with given id exists.
     * @param id the breakpoint id
     * @returns true if breakpoint exists and false otherwise
     */
    exists(id: string): boolean {
        return super.findMarkers().some(m => DebugUtils.makeBreakpointId(m.data) === id);
    }

    private toUri(breakpoint: ExtDebugProtocol.AggregatedBreakpoint): URI {
        if (DebugUtils.isSourceBreakpoint(breakpoint)) {
            return DebugUtils.toUri(breakpoint.source!);
        }

        if (DebugUtils.isFunctionBreakpoint(breakpoint)) {
            return new URI().withScheme('brk').withPath('function');
        }

        if (DebugUtils.isExceptionBreakpoint(breakpoint)) {
            return new URI().withScheme('brk').withPath('exception');
        }

        throw new Error('Unrecognized breakpoint type: ' + JSON.stringify(breakpoint));
    }
}
