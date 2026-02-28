// *****************************************************************************
// Copyright (C) 2018-2026 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { CommandService, Emitter, Event, MapUtils } from '@theia/core/lib/common';
import { LabelProvider, OpenerService, StorageService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { SourceBreakpoint, ExceptionBreakpoint, FunctionBreakpoint, BaseBreakpoint, InstructionBreakpoint, DataBreakpoint } from './breakpoint-marker';
import { DebugSourceBreakpoint } from '../model/debug-source-breakpoint';
import { DebugFunctionBreakpoint } from '../model/debug-function-breakpoint';
import { DebugInstructionBreakpoint } from '../model/debug-instruction-breakpoint';
import { DebugExceptionBreakpoint } from '../view/debug-exception-breakpoint';
import { DebugDataBreakpoint } from '../model/debug-data-breakpoint';
import { BPCapabilities, DebugBreakpoint, DebugBreakpointOptions } from '../model/debug-breakpoint';
import { DebugProtocol } from '@vscode/debugprotocol';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType } from '@theia/filesystem/lib/common/files';

export interface BreakpointsChangeEvent<T extends object> {
    uri: URI
    added: T[]
    removed: T[]
    changed: T[]
}

export type SourceBreakpointsChangeEvent = BreakpointsChangeEvent<DebugSourceBreakpoint>;
export type FunctionBreakpointsChangeEvent = BreakpointsChangeEvent<DebugFunctionBreakpoint>;
export type InstructionBreakpointsChangeEvent = BreakpointsChangeEvent<DebugInstructionBreakpoint>;
export type DataBreakpointsChangeEvent = BreakpointsChangeEvent<DebugDataBreakpoint>;

@injectable()
export class BreakpointManager {

    static EXCEPTION_URI = new URI('debug:exception://');

    static FUNCTION_URI = new URI('debug:function://');

    static INSTRUCTION_URI = new URI('debug:instruction://');

    static DATA_URI = new URI('debug:data://');

    // ── Source breakpoints, keyed by URI string ──

    protected readonly sourceBreakpoints = new Map<string, DebugSourceBreakpoint[]>();

    // ── Injected services ──

    @inject(StorageService)
    protected readonly storage: StorageService;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;
    @inject(CommandService)
    protected readonly commandService: CommandService;
    @inject(FileService)
    protected readonly fileService: FileService;

    // ── Events ──

    protected readonly onDidChangeMarkersEmitter = new Emitter<URI>();
    get onDidChangeMarkers(): Event<URI> {
        return this.onDidChangeMarkersEmitter.event;
    }
    protected fireOnDidChangeMarkers(uri: URI): void {
        this.onDidChangeMarkersEmitter.fire(uri);
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<SourceBreakpointsChangeEvent>();
    readonly onDidChangeBreakpoints = this.onDidChangeBreakpointsEmitter.event;

    protected readonly onDidChangeFunctionBreakpointsEmitter = new Emitter<FunctionBreakpointsChangeEvent>();
    readonly onDidChangeFunctionBreakpoints = this.onDidChangeFunctionBreakpointsEmitter.event;

    protected readonly onDidChangeInstructionBreakpointsEmitter = new Emitter<InstructionBreakpointsChangeEvent>();
    readonly onDidChangeInstructionBreakpoints = this.onDidChangeInstructionBreakpointsEmitter.event;

    protected readonly onDidChangeDataBreakpointsEmitter = new Emitter<DataBreakpointsChangeEvent>();
    readonly onDidChangeDataBreakpoints = this.onDidChangeDataBreakpointsEmitter.event;

    // ── Cached options object ──

    protected _breakpointOptions: DebugBreakpointOptions | undefined;

    // ── Initialization ──

    @postConstruct()
    protected init(): void {
        this.fileService.onDidFilesChange(event => {
            if (event.gotDeleted()) {
                for (const uriString of this.sourceBreakpoints.keys()) {
                    const uri = new URI(uriString);
                    if (event.contains(uri, FileChangeType.DELETED)) {
                        this.sourceBreakpoints.delete(uriString);
                        this.fireOnDidChangeMarkers(uri);
                    }
                }
            }
        });
    }

    // ── Source breakpoint storage ──

    getBreakpoints(uri?: URI): readonly DebugSourceBreakpoint[] {
        if (uri) {
            return this.sourceBreakpoints.get(uri.toString()) ?? [];
        }
        const result: DebugSourceBreakpoint[] = [];
        for (const bps of this.sourceBreakpoints.values()) {
            result.push(...bps);
        }
        return result;
    }

    getUris(): IterableIterator<string> {
        return this.sourceBreakpoints.keys();
    }

    hasBreakpoints(): boolean {
        return this.sourceBreakpoints.size > 0 || this.functionBreakpoints.length > 0 || this.instructionBreakpoints.length > 0;
    }

    /**
     * Replace the source breakpoints for a URI. Incoming `breakpoints` are
     * plain `SourceBreakpoint` data; existing `DebugSourceBreakpoint` wrappers
     * are preserved by ID so that session data survives position changes.
     */
    setBreakpoints(uri: URI, breakpoints: SourceBreakpoint[]): void {
        const current = this.getBreakpoints(uri);
        const currentById = new Map(current.map(bp => [bp.id, bp]));

        const sorted = breakpoints
            .slice()
            .sort((a, b) => (a.raw.line - b.raw.line) || ((a.raw.column || 0) - (b.raw.column || 0)));

        const seen = new Set<string>();
        const newBps: DebugSourceBreakpoint[] = [];
        for (const bp of sorted) {
            const posKey = `${bp.raw.line}:${bp.raw.column ?? 0}`;
            if (seen.has(posKey)) { continue; }
            seen.add(posKey);

            // Prefer matching by ID (preserves identity across position changes).
            const existing = currentById.get(bp.id);
            if (existing) {
                existing.origin.raw = bp.raw;
                existing.origin.enabled = bp.enabled;
                newBps.push(existing);
            } else {
                newBps.push(this.toDebugSourceBreakpoint(bp));
            }
        }

        this.applySourceBreakpoints(uri, newBps, current);
    }

    addBreakpoint(breakpoint: SourceBreakpoint): DebugSourceBreakpoint {
        const uri = new URI(breakpoint.uri);
        const current = this.getBreakpoints(uri);

        // Check for positional duplicate.
        const duplicate = current.find(
            c => c.line === breakpoint.raw.line && c.column === breakpoint.raw.column
        );
        if (duplicate) { return duplicate; }

        const bp = this.toDebugSourceBreakpoint(breakpoint);
        const newBps = [...current, bp];
        this.applySourceBreakpoints(uri, newBps, current);
        return bp;
    }

    removeBreakpoint(breakpoint: DebugSourceBreakpoint): void {
        const current = this.getBreakpoints(breakpoint.uri);
        const index = current.indexOf(breakpoint);
        if (index === -1) { return; }
        const retained = [...current.slice(0, index), ...current.slice(index + 1)];
        this.applySourceBreakpoints(breakpoint.uri, retained, current);
    }

    /**
     * Diff `oldBps` → `newBps`, store, fire markers and typed events.
     * Both arrays must be for the same URI.
     */
    protected applySourceBreakpoints(uri: URI, newBps: readonly DebugSourceBreakpoint[], oldBps: readonly DebugSourceBreakpoint[]): void {
        const oldById = new Map(oldBps.map(bp => [bp.id, bp]));
        const added: DebugSourceBreakpoint[] = [];
        const changed: DebugSourceBreakpoint[] = [];
        let didChange = false;
        for (const bp of newBps) {
            const old = oldById.get(bp.id);
            if (!old) {
                added.push(bp);
                didChange = true;
            } else {
                changed.push(bp);
                // Identity match: the wrapper was mutated in place, or the same
                // object was passed back (editor model position update).
                // Either way we must re-fire to keep decorations in sync.
                didChange = true;
                oldById.delete(bp.id);
            }
        }
        const removed = Array.from(oldById.values());
        didChange ||= removed.length > 0;

        if (!didChange) { return; }

        if (newBps.length > 0) {
            this.sourceBreakpoints.set(uri.toString(), [...newBps]);
        } else {
            this.sourceBreakpoints.delete(uri.toString());
        }
        this.fireOnDidChangeMarkers(uri);
        this.onDidChangeBreakpointsEmitter.fire({ uri, added, removed, changed });
    }

    removeBreakpoints(): void {
        for (const uriString of [...this.sourceBreakpoints.keys()]) {
            const uri = new URI(uriString);
            const old = this.sourceBreakpoints.get(uriString) ?? [];
            this.sourceBreakpoints.delete(uriString);
            this.fireOnDidChangeMarkers(uri);
            if (old.length) {
                this.onDidChangeBreakpointsEmitter.fire({ uri, added: [], removed: old, changed: [] });
            }
        }
        this.setFunctionBreakpoints([]);
        this.setInstructionBreakpoints([]);
        this.setDataBreakpoints([]);
    }

    // ── Query helpers ──

    getLineBreakpoints(uri: URI, line: number): DebugSourceBreakpoint[] {
        return this.getBreakpoints(uri).filter(bp => bp.line === line);
    }

    getInlineBreakpoint(uri: URI, line: number, column: number): DebugSourceBreakpoint | undefined {
        return this.getBreakpoints(uri).find(bp => bp.line === line && bp.column === column);
    }

    getBreakpointById(id: string): DebugBreakpoint | undefined {
        for (const bp of this.allBreakpoints()) {
            if (bp.id === id) { return bp; }
        }
    }

    * allBreakpoints(): IterableIterator<DebugBreakpoint> {
        for (const bps of this.sourceBreakpoints.values()) {
            yield* bps;
        }
        yield* this.functionBreakpoints;
        yield* this.instructionBreakpoints;
        yield* this.exceptionBreakpoints;
        yield* this.dataBreakpoints;
    }

    // ── Session data ──

    updateSessionData(sessionId: string, sessionCapabilities: DebugProtocol.Capabilities, bps?: Map<string, DebugProtocol.Breakpoint>): void {
        const bpCapabilities = this.toBpCapabilities(sessionCapabilities);
        const updatedUris = new Map<string, DebugBreakpoint[]>();
        for (const bp of this.allBreakpoints()) {
            if (!bps) {
                bp.update(sessionId, undefined);
                MapUtils.addOrInsertWith(updatedUris, bp.uri.toString(), bp);
            } else {
                const dataForBp = bps.get(bp.id);
                if (!dataForBp) { continue; }
                bp.update(sessionId, { ...bpCapabilities, ...dataForBp });
                MapUtils.addOrInsertWith(updatedUris, bp.uri.toString(), bp);
            }
        }
        for (const changed of updatedUris.values()) {
            this.fireTypedBreakpointEvent(changed[0].uri, [], changed, []);
        }
    }

    protected toBpCapabilities(capabilities: DebugProtocol.Capabilities): BPCapabilities {
        return {
            supportsConditionalBreakpoints: !!capabilities.supportsConditionalBreakpoints,
            supportsHitConditionalBreakpoints: !!capabilities.supportsHitConditionalBreakpoints,
            supportsLogPoints: !!capabilities.supportsLogPoints,
            supportsFunctionBreakpoints: !!capabilities.supportsFunctionBreakpoints,
            supportsDataBreakpoints: !!capabilities.supportsDataBreakpoints,
            supportsInstructionBreakpoints: !!capabilities.supportsInstructionBreakpoints,
        };
    }

    // ── Breakpoint construction ──

    protected toDebugSourceBreakpoint(source: SourceBreakpoint): DebugSourceBreakpoint {
        return DebugSourceBreakpoint.create(source, this.getBreakpointOptions());
    }

    getBreakpointOptions(): DebugBreakpointOptions {
        if (!this._breakpointOptions) {
            this._breakpointOptions = {
                labelProvider: this.labelProvider,
                openerService: this.openerService,
                commandService: this.commandService,
                breakpoints: this
            };
        }
        return this._breakpointOptions;
    }

    // ── Enable / disable ──

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
            this.fireOnDidChangeMarkers(BreakpointManager.INSTRUCTION_URI);
            this.fireOnDidChangeMarkers(BreakpointManager.DATA_URI);
            this.fireOnDidChangeMarkers(BreakpointManager.EXCEPTION_URI);
        }
    }

    enableAllBreakpoints(enabled: boolean): void {
        for (const uriString of this.getUris()) {
            let didChange = false;
            const uri = new URI(uriString);
            const bps = this.getBreakpoints(uri);
            for (const bp of bps) {
                didChange ||= this.doEnableBreakpoint(bp, enabled);
            }
            if (didChange) {
                this.fireOnDidChangeMarkers(uri);
                this.onDidChangeBreakpointsEmitter.fire({ uri, added: [], removed: [], changed: [...bps] });
            }
        }
        let didChangeFunction = false;
        for (const breakpoint of this.functionBreakpoints) {
            if (breakpoint.origin.enabled !== enabled) {
                breakpoint.origin.enabled = enabled;
                didChangeFunction = true;
            }
        }
        if (didChangeFunction) {
            this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);
            this.onDidChangeFunctionBreakpointsEmitter.fire({
                uri: BreakpointManager.FUNCTION_URI, added: [], removed: [], changed: [...this.functionBreakpoints]
            });
        }
        let didChangeInstruction = false;
        for (const breakpoint of this.instructionBreakpoints) {
            if (breakpoint.origin.enabled !== enabled) {
                breakpoint.origin.enabled = enabled;
                didChangeInstruction = true;
            }
        }
        if (didChangeInstruction) {
            this.fireOnDidChangeMarkers(BreakpointManager.INSTRUCTION_URI);
            this.onDidChangeInstructionBreakpointsEmitter.fire({
                uri: BreakpointManager.INSTRUCTION_URI, added: [], removed: [], changed: [...this.instructionBreakpoints]
            });
        }
        let didChangeData = false;
        for (const breakpoint of this.dataBreakpoints) {
            if (breakpoint.origin.enabled !== enabled) {
                breakpoint.origin.enabled = enabled;
                didChangeData = true;
            }
        }
        if (didChangeData) {
            this.fireOnDidChangeMarkers(BreakpointManager.DATA_URI);
            this.onDidChangeDataBreakpointsEmitter.fire({
                uri: BreakpointManager.DATA_URI, added: [], removed: [], changed: [...this.dataBreakpoints]
            });
        }
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

    // ── Generic update / fire ──

    updateBreakpoint<U extends BaseBreakpoint, T extends DebugBreakpoint<U>>(bp: T, update: Partial<U['raw']>): void {
        bp.origin.raw = { ...bp.origin.raw, ...update };
        this.fireBreakpointChanged(bp);
    }

    fireBreakpointChanged(breakpoint: DebugBreakpoint): void {
        this.fireOnDidChangeMarkers(breakpoint.uri);
        this.fireTypedBreakpointEvent(breakpoint.uri, [], [breakpoint], []);
    }

    protected fireTypedBreakpointEvent(uri: URI, added: DebugBreakpoint[], changed: DebugBreakpoint[], removed: DebugBreakpoint[]): void {
        // All breakpoints in a single call are the same type (grouped by URI).
        const sample = added[0] ?? changed[0] ?? removed[0];
        if (!sample) { return; }
        if (sample instanceof DebugSourceBreakpoint) {
            this.onDidChangeBreakpointsEmitter.fire({ uri, added, changed, removed } as SourceBreakpointsChangeEvent);
        } else if (sample instanceof DebugFunctionBreakpoint) {
            this.onDidChangeFunctionBreakpointsEmitter.fire({ uri, added, changed, removed } as FunctionBreakpointsChangeEvent);
        } else if (sample instanceof DebugInstructionBreakpoint) {
            this.onDidChangeInstructionBreakpointsEmitter.fire({ uri, added, changed, removed } as InstructionBreakpointsChangeEvent);
        } else if (sample instanceof DebugDataBreakpoint) {
            this.onDidChangeDataBreakpointsEmitter.fire({ uri, added, changed, removed } as DataBreakpointsChangeEvent);
        }
    }

    // ── Bulk remove by ID (plugin API) ──

    removeBreakpointsById(ids: string[]): void {
        const toRemove = new Set(ids);

        // Source breakpoints
        for (const [uriString, bps] of this.sourceBreakpoints.entries()) {
            const retained = bps.filter(bp => !toRemove.has(bp.id));
            if (retained.length !== bps.length) {
                const removed = bps.filter(bp => toRemove.has(bp.id));
                const uri = new URI(uriString);
                if (retained.length > 0) {
                    this.sourceBreakpoints.set(uriString, retained);
                } else {
                    this.sourceBreakpoints.delete(uriString);
                }
                this.fireOnDidChangeMarkers(uri);
                this.onDidChangeBreakpointsEmitter.fire({ uri, removed, added: [], changed: [] });
            }
        }

        // Function breakpoints
        const functionRemoved: DebugFunctionBreakpoint[] = [];
        this.functionBreakpoints = this.functionBreakpoints.filter(bp => {
            if (toRemove.has(bp.id)) {
                functionRemoved.push(bp);
                return false;
            }
            return true;
        });
        if (functionRemoved.length) {
            this.fireOnDidChangeMarkers(BreakpointManager.FUNCTION_URI);
            this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: BreakpointManager.FUNCTION_URI, removed: functionRemoved, added: [], changed: [] });
        }

        // Instruction breakpoints
        const instructionRemoved: DebugInstructionBreakpoint[] = [];
        this.instructionBreakpoints = this.instructionBreakpoints.filter(bp => {
            if (toRemove.has(bp.id)) {
                instructionRemoved.push(bp);
                return false;
            }
            return true;
        });
        if (instructionRemoved.length) {
            this.fireOnDidChangeMarkers(BreakpointManager.INSTRUCTION_URI);
            this.onDidChangeInstructionBreakpointsEmitter.fire({ uri: BreakpointManager.INSTRUCTION_URI, removed: instructionRemoved, added: [], changed: [] });
        }

        // Data breakpoints
        const dataRemoved: DebugDataBreakpoint[] = [];
        this.dataBreakpoints = this.dataBreakpoints.filter(bp => {
            if (toRemove.has(bp.id)) {
                dataRemoved.push(bp);
                return false;
            }
            return true;
        });
        if (dataRemoved.length) {
            this.fireOnDidChangeMarkers(BreakpointManager.DATA_URI);
            this.onDidChangeDataBreakpointsEmitter.fire({ uri: BreakpointManager.DATA_URI, removed: dataRemoved, added: [], changed: [] });
        }
    }

    // ── Exception breakpoints ──

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

    clearExceptionSessionEnablement(sessionId: string): void {
        for (const bp of this.exceptionBreakpoints) {
            bp.setSessionEnablement(sessionId, false);
        }
        this.fireOnDidChangeMarkers(BreakpointManager.EXCEPTION_URI);
    }

    protected doUpdateExceptionBreakpointVisibility(sessionId: string): void {
        for (const bp of this.exceptionBreakpoints) {
            bp.setPersistentVisibility(bp.isEnabledForSession(sessionId));
        }
    }

    // ── Function breakpoints ──

    protected functionBreakpoints: DebugFunctionBreakpoint[] = [];

    getFunctionBreakpoints(): readonly DebugFunctionBreakpoint[] {
        return this.functionBreakpoints;
    }

    setFunctionBreakpoints(functionBreakpoints: FunctionBreakpoint[]): void {
        const oldBreakpoints = new Map(this.functionBreakpoints.map(b => [b.id, b]));

        this.functionBreakpoints = functionBreakpoints.map(bp => {
            const existing = oldBreakpoints.get(bp.id);
            if (existing) { return existing; }
            return DebugFunctionBreakpoint.create(bp, this.getBreakpointOptions());
        });
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
        const duplicate = this.functionBreakpoints.find(c => c.origin.raw.name === bp.raw.name);
        if (duplicate) { return; }
        const newBp = DebugFunctionBreakpoint.create(bp, this.getBreakpointOptions());
        this.functionBreakpoints = [...this.functionBreakpoints, newBp];
        this.fireOnDidChangeMarkers(newBp.uri);
        this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: newBp.uri, added: [newBp], changed: [], removed: [] });
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

    removeFunctionBreakpoint(breakpoint: DebugFunctionBreakpoint): void {
        const index = this.functionBreakpoints.indexOf(breakpoint);
        if (index === -1) { return; }
        const removed = this.functionBreakpoints.splice(index, 1);
        this.fireOnDidChangeMarkers(breakpoint.uri);
        this.onDidChangeFunctionBreakpointsEmitter.fire({ uri: breakpoint.uri, removed, added: [], changed: [] });
    }

    // ── Instruction breakpoints ──

    protected instructionBreakpoints: DebugInstructionBreakpoint[] = [];

    getInstructionBreakpoints(): ReadonlyArray<DebugInstructionBreakpoint> {
        return this.instructionBreakpoints;
    }

    protected setInstructionBreakpoints(newBreakpoints: InstructionBreakpoint[]): void {
        const oldBreakpoints = new Map(this.instructionBreakpoints.map(bp => [bp.id, bp]));
        const currentBreakpoints = newBreakpoints.map(bp => {
            const existing = oldBreakpoints.get(bp.id);
            if (existing) { return existing; }
            return DebugInstructionBreakpoint.create(bp, this.getBreakpointOptions());
        });
        const added: DebugInstructionBreakpoint[] = [];
        const changed: DebugInstructionBreakpoint[] = [];
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
        const duplicate = this.instructionBreakpoints.find(
            c => c.origin.raw.instructionReference === address && (c.origin.raw.offset ?? 0) === (offset ?? 0)
        );
        if (duplicate) { return; }
        const newBp = DebugInstructionBreakpoint.create(InstructionBreakpoint.create({
            instructionReference: address,
            offset,
            condition,
            hitCondition,
        }), this.getBreakpointOptions());
        this.instructionBreakpoints = [...this.instructionBreakpoints, newBp];
        this.fireOnDidChangeMarkers(BreakpointManager.INSTRUCTION_URI);
        this.onDidChangeInstructionBreakpointsEmitter.fire({ uri: BreakpointManager.INSTRUCTION_URI, added: [newBp], removed: [], changed: [] });
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

    clearInstructionBreakpoints(): void {
        this.setInstructionBreakpoints([]);
    }

    // ── Data breakpoints ──

    protected dataBreakpoints: DebugDataBreakpoint[] = [];

    getDataBreakpoints(): readonly DebugDataBreakpoint[] {
        return this.dataBreakpoints;
    }

    setDataBreakpoints(breakpoints: DataBreakpoint[]): void {
        const oldBreakpoints = new Map(this.dataBreakpoints.map(bp => [bp.id, bp]));
        const newBreakpoints = breakpoints.map(bp => {
            const existing = oldBreakpoints.get(bp.id);
            if (existing) { return existing; }
            return DebugDataBreakpoint.create(bp, this.getBreakpointOptions());
        });
        const added: DebugDataBreakpoint[] = [];
        const changed: DebugDataBreakpoint[] = [];
        for (const bp of newBreakpoints) {
            if (oldBreakpoints.has(bp.id)) {
                changed.push(bp);
            } else {
                added.push(bp);
            }
            oldBreakpoints.delete(bp.id);
        }
        const removed = Array.from(oldBreakpoints.values());
        this.dataBreakpoints = newBreakpoints;
        this.fireOnDidChangeMarkers(BreakpointManager.DATA_URI);
        this.onDidChangeDataBreakpointsEmitter.fire({ uri: BreakpointManager.DATA_URI, added, removed, changed });
    }

    addDataBreakpoint(breakpoint: DataBreakpoint): void {
        const duplicate = this.dataBreakpoints.find(c => c.origin.raw.dataId === breakpoint.raw.dataId);
        if (duplicate) { return; }
        const newBp = DebugDataBreakpoint.create(breakpoint, this.getBreakpointOptions());
        this.dataBreakpoints = [...this.dataBreakpoints, newBp];
        this.fireOnDidChangeMarkers(BreakpointManager.DATA_URI);
        this.onDidChangeDataBreakpointsEmitter.fire({ uri: BreakpointManager.DATA_URI, added: [newBp], removed: [], changed: [] });
    }

    updateDataBreakpoint(bp: DebugDataBreakpoint, options: { enabled?: boolean; raw?: Partial<Omit<DebugProtocol.DataBreakpoint, 'dataId'>> }): void {
        if (!this.dataBreakpoints.includes(bp)) { return; }
        if (options.raw) {
            Object.assign(bp.origin.raw, options.raw);
        }
        if (options.enabled !== undefined) {
            bp.origin.enabled = options.enabled;
        }
        this.fireBreakpointChanged(bp);
    }

    removeDataBreakpoint(bp: DebugDataBreakpoint): void {
        const index = this.dataBreakpoints.indexOf(bp);
        if (index < 0) { return; }
        const removed = this.dataBreakpoints.splice(index, 1);
        this.fireOnDidChangeMarkers(BreakpointManager.DATA_URI);
        this.onDidChangeDataBreakpointsEmitter.fire({ uri: BreakpointManager.DATA_URI, added: [], removed, changed: [] });
    }

    // ── Persistence ──

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
        if (data.dataBreakpoints) {
            this.setDataBreakpoints(data.dataBreakpoints);
        }
    }

    save(): void {
        const data: BreakpointManager.Data = {
            breakpointsEnabled: this._breakpointsEnabled,
            breakpoints: {}
        };
        for (const uri of this.getUris()) {
            data.breakpoints[uri] = (this.sourceBreakpoints.get(uri) ?? []).map(bp => bp.origin);
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
        const dataBreakpointsToStore = this.dataBreakpoints.filter(candidate => candidate.origin.info.canPersist);
        if (dataBreakpointsToStore.length) {
            data.dataBreakpoints = dataBreakpointsToStore.map(({ origin }) => origin);
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
        dataBreakpoints?: DataBreakpoint[];
    }
}
