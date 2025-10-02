// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as deepEqual from 'fast-deep-equal';
import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter, MapUtils } from '@theia/core/lib/common';
import { LabelProvider, OpenerService, StorageService } from '@theia/core/lib/browser';
import { Marker } from '@theia/markers/lib/common/marker';
import { MarkerManager } from '@theia/markers/lib/browser/marker-manager';
import URI from '@theia/core/lib/common/uri';
import { SourceBreakpoint, BREAKPOINT_KIND, ExceptionBreakpoint, FunctionBreakpoint, BaseBreakpoint, InstructionBreakpoint } from './breakpoint-marker';
import { DebugSourceBreakpoint } from '../model/debug-source-breakpoint';
import { DebugFunctionBreakpoint } from '../model/debug-function-breakpoint';
import { DebugInstructionBreakpoint } from '../model/debug-instruction-breakpoint';
import { DebugExceptionBreakpoint } from '../view/debug-exception-breakpoint';
import { BPCapabilities, DebugBreakpoint, DebugBreakpointOptions } from '../model/debug-breakpoint';
import { DebugProtocol } from '@vscode/debugprotocol';

export interface BreakpointsChangeEvent<T extends object> {
    uri: URI
    added: T[]
    removed: T[]
    changed: T[]
}

export type SourceBreakpointsChangeEvent = BreakpointsChangeEvent<DebugSourceBreakpoint>;
export type FunctionBreakpointsChangeEvent = BreakpointsChangeEvent<DebugFunctionBreakpoint>;
export type InstructionBreakpointsChangeEvent = BreakpointsChangeEvent<DebugInstructionBreakpoint>;

@injectable()
export class BreakpointManager extends MarkerManager<DebugSourceBreakpoint> {

    static EXCEPTION_URI = new URI('debug:exception://');

    static FUNCTION_URI = new URI('debug:function://');

    static INSTRUCTION_URI = new URI('debug:instruction://');

    protected readonly owner = 'breakpoint';

    @inject(StorageService)
    protected readonly storage: StorageService;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    getKind(): string {
        return BREAKPOINT_KIND;
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<SourceBreakpointsChangeEvent>();
    readonly onDidChangeBreakpoints = this.onDidChangeBreakpointsEmitter.event;

    protected readonly onDidChangeFunctionBreakpointsEmitter = new Emitter<FunctionBreakpointsChangeEvent>();
    readonly onDidChangeFunctionBreakpoints = this.onDidChangeFunctionBreakpointsEmitter.event;

    protected readonly onDidChangeInstructionBreakpointsEmitter = new Emitter<InstructionBreakpointsChangeEvent>();
    readonly onDidChangeInstructionBreakpoints = this.onDidChangeInstructionBreakpointsEmitter.event;

    override setMarkers(uri: URI, owner: string, newMarkers: DebugSourceBreakpoint[]): Marker<DebugSourceBreakpoint>[] {
        const result = this.findMarkers({ uri, owner });
        const added: DebugSourceBreakpoint[] = [];
        const removed: DebugSourceBreakpoint[] = [];
        const changed: DebugSourceBreakpoint[] = [];
        const oldMarkers = new Map(result.map(({ data }) => [data.id, data]));
        const ids = new Set<string>();
        let didChangeMarkers = false;
        for (const newMarker of newMarkers) {
            ids.add(newMarker.id);
            const oldMarker = oldMarkers.get(newMarker.id);
            if (!oldMarker) {
                added.push(newMarker);
            } else {
                // We emit all existing markers as 'changed', but we only fire an event if something really did change.
                // We also fire an event if oldMarker === newMarker, as we cannot actually detect a change in this case
                // (https://github.com/eclipse-theia/theia/issues/12546).
                didChangeMarkers ||= !!added.length || oldMarker === newMarker || !deepEqual(oldMarker, newMarker);
                changed.push(newMarker);
            }
        }
        for (const [id, data] of oldMarkers.entries()) {
            if (!ids.has(id)) {
                removed.push(data);
            }
        }
        if (added.length || removed.length || didChangeMarkers) {
            super.setMarkers(uri, owner, newMarkers);
            this.onDidChangeBreakpointsEmitter.fire({ uri, added, removed, changed });
        }
        return result;
    }

    getBreakpointById(id: string): DebugBreakpoint | undefined {
        for (const bp of this.allBreakpoints()) {
            if (bp.id === id) {
                return bp;
            }
        }
    }

    getLineBreakpoints(uri: URI, line: number): DebugSourceBreakpoint[] {
        return this.findMarkers({
            uri,
            dataFilter: breakpoint => breakpoint.line === line
        }).map(({ data }) => data);
    }

    getInlineBreakpoint(uri: URI, line: number, column: number): DebugSourceBreakpoint | undefined {
        const marker = this.findMarkers({
            uri,
            dataFilter: breakpoint => breakpoint.line === line && breakpoint.column === column
        })[0];
        return marker && marker.data;
    }

    getBreakpoints(uri?: URI): DebugSourceBreakpoint[] {
        return this.findMarkers({ uri }).map(marker => marker.data);
    }

    setBreakpoints(uri: URI, breakpoints: SourceBreakpoint[]): void {
        const current = this.getBreakpoints(uri);
        const newBps = breakpoints
            .sort((a, b) => (a.raw.line - b.raw.line) || ((a.raw.column || 0) - (b.raw.column || 0)))
            .filter((candidate, index, self) => {
                const duplicatesPrevious = self[index - 1]?.raw.line === candidate.raw.line && (self[index - 1]?.raw.column ?? 0) === (candidate.raw.column ?? 0);
                return !duplicatesPrevious;
            })
            .map(bp => this.doAddBreakpoint(bp, current)[0]);
        this.setMarkers(uri, this.owner, newBps);
    }

    addBreakpoint(breakpoint: SourceBreakpoint): DebugSourceBreakpoint {
        const uri = new URI(breakpoint.uri);
        const breakpoints = this.getBreakpoints(uri);
        const [bp, bps] = this.doAddBreakpoint(breakpoint, breakpoints);
        if (bps !== breakpoints) {
            this.setMarkers(uri, this.owner, bps);
        }
        return bp;
    }

    protected doAddBreakpoint(breakpoint: SourceBreakpoint, current: DebugSourceBreakpoint[]): [DebugSourceBreakpoint, DebugSourceBreakpoint[]] {
        const wouldDuplicate = current.find(candidate => candidate.line === breakpoint.raw.line && candidate.column === breakpoint.raw.column);
        if (wouldDuplicate) {
            return [wouldDuplicate, current];
        }
        const asDebugSource = this.toDebugSourceBreakpoint(breakpoint);
        const newBreakpoints = [...current, asDebugSource];
        return [asDebugSource, newBreakpoints];
    }

    * allBreakpoints(): IterableIterator<DebugBreakpoint> {
        yield* this.getBreakpoints();
        yield* this.functionBreakpoints;
        yield* this.instructionBreakpoints;
        yield* this.exceptionBreakpoints;
    }

    updateSessionData(sessionId: string, sessionCapabilities: DebugProtocol.Capabilities, bps?: Map<string, DebugProtocol.Breakpoint>): void {
        const bpCapabilities = this.toBpCapabilities(sessionCapabilities);
        const updatedUris = new Map<string, DebugBreakpoint[]>();
        for (const bp of this.allBreakpoints()) {
            if (!bps) {
                MapUtils.addOrInsertWith(updatedUris, bp.uri.toString(), bp);
                bp.update(sessionId, undefined);
            } else {
                const dataForBp = bps.get(bp.id);
                if (!dataForBp) { continue; }
                MapUtils.addOrInsertWith(updatedUris, bp.uri.toString(), bp);
                bp.update(sessionId, { ...bpCapabilities, ...dataForBp });
            }
        }
        for (const changed of updatedUris.values()) {
            const emitter = this.getEmitterForBreakpoint(changed[0]);
            emitter?.fire({ uri: changed[0].uri, changed, added: [], removed: [] });
        }
    }

    protected toBpCapabilities(capabilities: DebugProtocol.Capabilities): BPCapabilities {
        return {
            supportsConditionalBreakpoints:
                !!capabilities.supportsConditionalBreakpoints,
            supportsHitConditionalBreakpoints:
                !!capabilities.supportsHitConditionalBreakpoints,
            supportsLogPoints: !!capabilities.supportsLogPoints,
            supportsFunctionBreakpoints:
                !!capabilities.supportsFunctionBreakpoints,
            supportsDataBreakpoints: !!capabilities.supportsDataBreakpoints,
            supportsInstructionBreakpoints:
                !!capabilities.supportsInstructionBreakpoints,
        };
    }

    protected toDebugSourceBreakpoint(source: SourceBreakpoint): DebugSourceBreakpoint {
        return DebugSourceBreakpoint.create(source, this.getBreakpointOptions());
    }

    protected getBreakpointOptions(): DebugBreakpointOptions {
        return {
            labelProvider: this.labelProvider,
            openerService: this.openerService,
            breakpoints: this
        };
    }

    enableAllBreakpoints(enabled: boolean): void {
        for (const uriString of this.getUris()) {
            let didChange = false;
            const uri = new URI(uriString);
            const markers = this.findMarkers({ uri });
            for (const marker of markers) {
                didChange ||= this.doEnableBreakpoint(marker.data, enabled);
            }
            if (didChange) {
                this.fireOnDidChangeMarkers(uri);
            }
        }
        let didChangeFunction = false;
        for (const breakpoint of (this.getFunctionBreakpoints() as DebugBreakpoint[]).concat(this.getInstructionBreakpoints())) {
            if (breakpoint.enabled !== enabled) {
                breakpoint.origin.enabled = enabled;
                didChangeFunction = true;

            }
        }
        if (didChangeFunction) {
            this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);
        }
    }

    updateBreakpoint<U extends BaseBreakpoint, T extends DebugBreakpoint<U>>(bp: T, update: Partial<U['raw']>): void {
        bp.origin.raw = { ...bp.origin.raw, ...update };
        this.fireBreakpointChanged(bp);
    }

    updateFunctionBreakpoint(bp: DebugFunctionBreakpoint, update: Partial<DebugProtocol.FunctionBreakpoint>): void {
        if (!this.functionBreakpoints.includes(bp)) { return; }
        const removed: DebugFunctionBreakpoint[] = [];
        if ('name' in update && !update.name) {
            throw new Error('Name field of function breakpoint must be populated.');
        } else if ('name' in update) {
            this.functionBreakpoints = this.functionBreakpoints.filter(candidate => {
                if (candidate !== bp && candidate.origin.raw.name === update.name) {
                    removed.push(candidate);
                    return false;
                }
                return true;
            });
        }
        bp.origin.raw = { ...bp.origin.raw, ...update };
        this.fireOnDidChangeMarkers(bp.uri);
        this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: bp.uri, changed: [bp], removed, added: [] });
    }

    enableBreakpoint<T extends DebugBreakpoint>(breakpoint: T, enabled: boolean): void {
        const didChange = this.doEnableBreakpoint(breakpoint, enabled);
        if (didChange) {
            this.fireBreakpointChanged(breakpoint);
        }
    }

    protected doEnableBreakpoint(breakpoint: DebugBreakpoint, enabled: boolean): boolean {
        if (breakpoint.origin.enabled !== enabled) {
            breakpoint.origin.enabled = enabled;
            return true;
        }
        return false;
    }

    removeBreakpointsById(ids: string[]): void {
        const toRemove = new Set(ids);
        const updatedSource = new Map<string, DebugSourceBreakpoint[]>();
        for (const [uri, collection] of this.getMarkersByUri()) {
            const current = collection.getMarkers(this.owner);
            const afterDeletion = current.filter(({ data: { id } }) => !toRemove.has(id)).map(({ data }) => data);
            if (afterDeletion.length !== current.length) {
                updatedSource.set(uri, afterDeletion);
            }
        }
        const functionRemoved: DebugFunctionBreakpoint[] = [];
        this.functionBreakpoints = this.functionBreakpoints.filter(bp => {
            if (toRemove.has(bp.id)) {
                functionRemoved.push(bp);
                return false;
            }
            return true;
        });
        const instructionRemoved: DebugInstructionBreakpoint[] = [];
        this.instructionBreakpoints = this.instructionBreakpoints.filter(bp => {
            if (toRemove.has(bp.id)) {
                instructionRemoved.push(bp);
                return false;
            }
            return true;
        });
        if (functionRemoved.length) {
            this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);
            this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: BreakpointManager.FUNCTION_URI, removed: functionRemoved, added: [], changed: [] });
        }
        if (instructionRemoved.length) {
            this.fireOnDidChangeMarkers(BreakpointManager.INSTRUCTION_URI);
            this.onDidChangeInstructionBreakpointsEmitter.fire({ uri: BreakpointManager.INSTRUCTION_URI, removed: instructionRemoved, added: [], changed: [] });
        }
        for (const [uri, updatedBps] of updatedSource.entries()) {
            this.setMarkers(new URI(uri), this.owner, updatedBps);
        }
    }

    fireBreakpointChanged<T extends DebugBreakpoint>(breakpoint: T): void {
        this.fireOnDidChangeMarkers(breakpoint.uri);
        const emitter = this.getEmitterForBreakpoint(breakpoint);
        emitter?.fire({ uri: breakpoint.uri, changed: [breakpoint], added: [], removed: [] });
    }

    removeBreakpoint(breakpoint: DebugSourceBreakpoint): void {
        const bps = this.getBreakpoints(breakpoint.uri);
        const index = bps.indexOf(breakpoint);
        if (index === -1) { return; }
        const retained = [...bps.slice(0, index), ...bps.slice(index + 1)];
        this.setMarkers(breakpoint.uri, this.owner, retained);
    }

    removeInstructionBreakpoint(breakpoint: DebugInstructionBreakpoint): void {
        const index = this.instructionBreakpoints.indexOf(breakpoint);
        if (index === -1) { return; }
        const removed = this.instructionBreakpoints.splice(index, 1);
        this.fireOnDidChangeMarkers(breakpoint.uri);
        this.onDidChangeInstructionBreakpointsEmitter.fire({ uri: breakpoint.uri, removed, added: [], changed: [] });
    }

    removeInstructionBreakpointAt(address: string): void {
        const match = this.instructionBreakpoints.find(candidate => candidate.origin.raw.instructionReference === address);
        if (match) {
            this.removeInstructionBreakpoint(match);
        }
    }

    removeFunctionBreakpoint(breakpoint: DebugFunctionBreakpoint): void {
        const index = this.functionBreakpoints.indexOf(breakpoint);
        if (index === -1) { return; }
        const removed = this.functionBreakpoints.splice(index, 1);
        this.fireOnDidChangeMarkers(breakpoint.uri);
        this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: breakpoint.uri, removed, added: [], changed: [] });
    }

    protected getEmitterForBreakpoint<T extends DebugBreakpoint>(breakpoint: T): Emitter<BreakpointsChangeEvent<T>> | undefined {
        return ((this.instructionBreakpoints as DebugBreakpoint[]).includes(breakpoint)
            ? this.onDidChangeInstructionBreakpointsEmitter
            : (this.functionBreakpoints as DebugBreakpoint[]).includes(breakpoint)
                ? this.onDidChangeFunctionBreakpointsEmitter
                : (this.getBreakpoints(breakpoint.uri) as DebugBreakpoint[]).includes(breakpoint)
                    ? this.onDidChangeBreakpointsEmitter
                    : undefined) as Emitter<BreakpointsChangeEvent<T>> | undefined;
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

    protected exceptionBreakpoints = new Array<DebugExceptionBreakpoint>();

    getExceptionBreakpoint(filter: DebugProtocol.ExceptionBreakpointsFilter): DebugExceptionBreakpoint | undefined {
        return this.exceptionBreakpoints.find(candidate => ExceptionBreakpoint.matches(candidate.origin.raw, filter));
    }

    getExceptionBreakpoints(): readonly DebugExceptionBreakpoint[] {
        return this.exceptionBreakpoints;
    }

    addExceptionBreakpoints(filters: DebugProtocol.ExceptionBreakpointsFilter[], sessionId: string): void {
        for (const filter of filters) {
            let bp = this.exceptionBreakpoints.find(candidate => ExceptionBreakpoint.matches(candidate.origin.raw, filter));
            if (!bp) {
                bp = DebugExceptionBreakpoint.create(ExceptionBreakpoint.create(filter), this.getBreakpointOptions());
                this.exceptionBreakpoints.push(bp);
            }
            bp.setSessionEnablement(sessionId, true);
            this.doUpdateExceptionBreakpointVisibility(sessionId);
        }
        this.fireOnDidChangeMarkers(BreakpointManager.EXCEPTION_URI);
    }

    updateExceptionBreakpointVisibility(sessionId: string): void {
        this.doUpdateExceptionBreakpointVisibility(sessionId);
        this.fireOnDidChangeMarkers(BreakpointManager.EXCEPTION_URI);
    }

    protected doUpdateExceptionBreakpointVisibility(sessionId: string): void {
        for (const bp of this.exceptionBreakpoints) {
            bp.setPersistentVisibility(bp.isEnabledForSession(sessionId));
        }
    }

    protected functionBreakpoints: DebugFunctionBreakpoint[] = [];

    getFunctionBreakpoints(): DebugFunctionBreakpoint[] {
        return this.functionBreakpoints;
    }

    setFunctionBreakpoints(functionBreakpoints: FunctionBreakpoint[]): void {
        const oldBreakpoints = new Map(this.functionBreakpoints.map(b => [b.id, b]));

        this.functionBreakpoints = functionBreakpoints.map(bp => this.doAddFunctionBreakpoint(bp)[0]);
        this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);

        const added: DebugFunctionBreakpoint[] = [];
        const removed: DebugFunctionBreakpoint[] = [];
        const changed: DebugFunctionBreakpoint[] = [];
        const ids = new Set<string>();
        for (const newBreakpoint of this.functionBreakpoints) {
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

    addFunctionBreakpoint(bp: FunctionBreakpoint): void {
        const [functionBp, functionBps] = this.doAddFunctionBreakpoint(bp);
        if (functionBps === this.functionBreakpoints) { return; }
        this.functionBreakpoints = functionBps;
        this.fireOnDidChangeMarkers(functionBp.uri);
        this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: functionBp.uri, added: [functionBp], changed: [], removed: [] });
    }

    protected doAddFunctionBreakpoint(functionBreakpoint: FunctionBreakpoint): [DebugFunctionBreakpoint, DebugFunctionBreakpoint[]] {
        const wouldDuplicate = this.functionBreakpoints.find(candidate => candidate.origin.raw.name === functionBreakpoint.raw.name);
        if (wouldDuplicate) {
            return [wouldDuplicate, this.functionBreakpoints];
        }
        const newBreakpoint = DebugFunctionBreakpoint.create(functionBreakpoint, this.getBreakpointOptions());
        return [newBreakpoint, this.functionBreakpoints.concat(newBreakpoint)];
    }

    protected instructionBreakpoints: DebugInstructionBreakpoint[] = [];

    getInstructionBreakpoints(): ReadonlyArray<DebugInstructionBreakpoint> {
        return Object.freeze(this.instructionBreakpoints.slice());
    }

    hasBreakpoints(): boolean {
        return Boolean(this.getUris().next().value || this.functionBreakpoints.length || this.instructionBreakpoints.length);
    }

    protected setInstructionBreakpoints(newBreakpoints: InstructionBreakpoint[]): void {
        const oldBreakpoints = new Map(this.instructionBreakpoints.map(breakpoint => [breakpoint.id, breakpoint]));
        const currentBreakpoints = newBreakpoints.map(bp => this.doAddInstructionBreakpoint(bp, this.instructionBreakpoints)[0]);
        const added = [];
        const changed = [];
        for (const breakpoint of currentBreakpoints) {
            const old = oldBreakpoints.get(breakpoint.id);
            if (old) {
                changed.push(old);
            } else {
                added.push(breakpoint);
            }
            oldBreakpoints.delete(breakpoint.id);
        }
        const removed = Array.from(oldBreakpoints.values());
        this.instructionBreakpoints = currentBreakpoints;
        this.fireOnDidChangeMarkers(BreakpointManager.INSTRUCTION_URI);
        this.onDidChangeInstructionBreakpointsEmitter.fire({ uri: BreakpointManager.INSTRUCTION_URI, added, removed, changed });
    }

    addInstructionBreakpoint(address: string, offset: number, condition?: string, hitCondition?: string): void {
        const [newBp, newCollection] = this.doAddInstructionBreakpoint(InstructionBreakpoint.create({
            instructionReference: address,
            offset,
            condition,
            hitCondition,
        }), this.instructionBreakpoints);
        if (newCollection !== this.instructionBreakpoints) {
            this.instructionBreakpoints = newCollection;
            this.fireOnDidChangeMarkers(BreakpointManager.INSTRUCTION_URI);
            this.onDidChangeInstructionBreakpointsEmitter.fire({ uri: BreakpointManager.INSTRUCTION_URI, added: [newBp], removed: [], changed: [] });
        }
    }

    protected doAddInstructionBreakpoint(toAdd: InstructionBreakpoint, current: DebugInstructionBreakpoint[]): [DebugInstructionBreakpoint, DebugInstructionBreakpoint[]] {
        const duplicate = this.instructionBreakpoints.find(candidate => candidate.origin.raw.instructionReference === toAdd.raw.instructionReference
            && (candidate.origin.raw.offset ?? 0) === (toAdd.raw.offset ?? 0));
        if (duplicate) { return [duplicate, current]; }
        const newBp = DebugInstructionBreakpoint.create(toAdd, this.getBreakpointOptions());
        return [newBp, current.concat(newBp)];
    }

    clearInstructionBreakpoints(): void {
        this.setInstructionBreakpoints([]);
    }

    removeBreakpoints(): void {
        this.cleanAllMarkers();
        this.setFunctionBreakpoints([]);
        this.setInstructionBreakpoints([]);
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
            this.exceptionBreakpoints = data.exceptionBreakpoints.map(bp => DebugExceptionBreakpoint.create(bp, this.getBreakpointOptions()));
            this.fireOnDidChangeMarkers(BreakpointManager.EXCEPTION_URI);
        }
        if (data.instructionBreakpoints) {
            this.setInstructionBreakpoints(data.instructionBreakpoints);
        }
    }

    save(): void {
        const data: BreakpointManager.Data = {
            breakpointsEnabled: this._breakpointsEnabled,
            breakpoints: {}
        };
        const uris = this.getUris();
        for (const uri of uris) {
            data.breakpoints[uri] = this.findMarkers({ uri: new URI(uri) }).map(marker => marker.data.origin);
        }
        if (this.functionBreakpoints.length) {
            data.functionBreakpoints = this.functionBreakpoints.map(({ origin }) => origin);
        }
        if (this.exceptionBreakpoints.length) {
            data.exceptionBreakpoints = this.exceptionBreakpoints.filter(candidate => candidate.isPersistentlyVisible()).map(({ origin }) => origin);
        }
        if (this.instructionBreakpoints.length) {
            data.instructionBreakpoints = this.instructionBreakpoints.map(({ origin }) => origin);
        }
        this.storage.setData('breakpoints', data);
    }

}
export namespace BreakpointManager {
    export interface Data {
        breakpointsEnabled: boolean;
        breakpoints: {
            [uri: string]: SourceBreakpoint[];
        }
        exceptionBreakpoints?: ExceptionBreakpoint[];
        functionBreakpoints?: FunctionBreakpoint[];
        instructionBreakpoints?: InstructionBreakpoint[];
    }
}
