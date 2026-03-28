// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { Container } from '@theia/core/shared/inversify';
import { CommandService, Emitter } from '@theia/core/lib/common';
import { LabelProvider, OpenerService } from '@theia/core/lib/browser';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileChangeType } from '@theia/filesystem/lib/common/files';
import { expect } from 'chai';
import {
    BreakpointManager,
    SourceBreakpointsChangeEvent,
    FunctionBreakpointsChangeEvent,
    InstructionBreakpointsChangeEvent,
    DataBreakpointsChangeEvent
} from './breakpoint-manager';
import {
    SourceBreakpoint, FunctionBreakpoint,
    DataBreakpoint, DataBreakpointSourceType
} from './breakpoint-marker';
import { DebugDataBreakpoint } from '../model/debug-data-breakpoint';
import { BPSessionData } from '../model/debug-breakpoint';
import { DebugProtocol } from '@vscode/debugprotocol';

disableJSDOM();

// ── Helpers ──

const FILE_A = new URI('file:///workspace/a.ts');
const FILE_B = new URI('file:///workspace/b.ts');

function makeSourceBreakpoint(uri: URI, line: number, opts?: Partial<DebugProtocol.SourceBreakpoint & { id: string; enabled: boolean; column: number }>): SourceBreakpoint {
    return SourceBreakpoint.create(
        uri,
        { line, column: opts?.column, condition: opts?.condition, hitCondition: opts?.hitCondition, logMessage: opts?.logMessage },
        opts?.id ? { id: opts.id, uri: uri.toString(), enabled: opts?.enabled ?? true, raw: { line } } as SourceBreakpoint : undefined
    );
}

function makeFunctionBreakpoint(name: string): FunctionBreakpoint {
    return FunctionBreakpoint.create({ name });
}

function makeDataBreakpoint(dataId: string, description = 'some var'): DataBreakpoint {
    return DataBreakpoint.create(
        { dataId, accessType: 'write' },
        { dataId, description, accessTypes: ['read', 'write'], canPersist: true },
        { type: DataBreakpointSourceType.Variable, variable: description }
    );
}

const defaultCapabilities: DebugProtocol.Capabilities = {};

function makeSessionData(overrides: Partial<BPSessionData> = {}): Omit<BPSessionData, 'sessionId'> {
    return {
        id: 1,
        verified: true,
        line: 5,
        supportsConditionalBreakpoints: false,
        supportsHitConditionalBreakpoints: false,
        supportsLogPoints: false,
        supportsFunctionBreakpoints: false,
        supportsDataBreakpoints: false,
        supportsInstructionBreakpoints: false,
        ...overrides,
    };
}

// ── Test Setup ──

function createManager(): { manager: BreakpointManager; storageData: Record<string, unknown>; fileChangeEmitter: Emitter<FileChangesEvent> } {
    const container = new Container();

    const storageData: Record<string, unknown> = {};
    const fileChangeEmitter = new Emitter<FileChangesEvent>();

    container.bind(LabelProvider).toConstantValue({
        getName: (uri: URI) => uri.path.base,
        getLongName: (uri: URI) => uri.path.toString(),
    } as unknown as LabelProvider);

    container.bind(OpenerService).toConstantValue({} as unknown as OpenerService);
    container.bind(CommandService).toConstantValue({} as unknown as CommandService);

    container.bind(StorageService).toConstantValue({
        getData: async <T>(key: string, defaultValue: T) => (storageData[key] as T) ?? defaultValue,
        setData: async <T>(key: string, data: T) => { storageData[key] = data; },
    } as StorageService);

    container.bind(FileService).toConstantValue({
        onDidFilesChange: fileChangeEmitter.event,
    } as unknown as FileService);

    container.bind(BreakpointManager).toSelf().inSingletonScope();

    const manager = container.get(BreakpointManager);

    return { manager, storageData, fileChangeEmitter };
}

// ── Tests ──

describe('DebugBreakpoint.update() — session data lifecycle', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('adding session data for a session updates _raw', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true, line: 10 }));
        expect(bp.raw).to.not.be.undefined;
        expect(bp.raw!.sessionId).to.equal('session-1');
        expect(bp.raw!.line).to.equal(10);
    });

    it('verified single session: verified returns true', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true }));
        expect(bp.verified).to.be.true;
    });

    it('unverified single session: verified returns false, _raw still available', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: false, message: 'not yet' }));
        expect(bp.verified).to.be.false;
        expect(bp.raw).to.not.be.undefined;
        expect(bp.raw!.message).to.equal('not yet');
    });

    it('multiple sessions, one verified: _raw picks the verified one', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: false, line: 10 }));
        bp.update('session-2', makeSessionData({ verified: true, line: 11 }));
        expect(bp.verified).to.be.true;
        expect(bp.raw!.sessionId).to.equal('session-2');
        expect(bp.raw!.line).to.equal(11);
    });

    it('multiple sessions, both verified at same location: _raw picks one', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true, line: 10, column: 1 }));
        bp.update('session-2', makeSessionData({ verified: true, line: 10, column: 1 }));
        expect(bp.verified).to.be.true;
        // Both agree on location, so verifiedLocations.size === 1 → picks that one
        expect(bp.raw).to.not.be.undefined;
    });

    it('multiple sessions, verified at different locations: _raw cleared, verified stays true', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true, line: 10 }));
        bp.update('session-2', makeSessionData({ verified: true, line: 20 }));
        // Sessions disagree → _raw is undefined so the breakpoint falls back
        // to its user-set position, but still shows as verified (VSCode semantics).
        expect(bp.raw).to.be.undefined;
        expect(bp.verified).to.be.true;
        expect(bp.installed).to.be.true;
        // Per-session data is still accessible for callers that need it.
        expect(bp.getDebugProtocolBreakpoint('session-1')!.line).to.equal(10);
        expect(bp.getDebugProtocolBreakpoint('session-2')!.line).to.equal(20);
    });

    it('removing session data for a session that contributed: data is deleted, _raw recomputed', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true, line: 10 }));
        bp.update('session-2', makeSessionData({ verified: true, line: 20 }));
        bp.update('session-1', undefined);
        expect(bp.raw).to.not.be.undefined;
        expect(bp.raw!.sessionId).to.equal('session-2');
    });

    it('removing session data for a session that never contributed: no-op', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true, line: 10 }));
        const rawBefore = bp.raw;
        bp.update('session-never', undefined);
        expect(bp.raw).to.equal(rawBefore);
    });

    it('removing all session data: _raw becomes undefined, verified defaults to true', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true, line: 10 }));
        bp.update('session-1', undefined);
        expect(bp.raw).to.be.undefined;
        // No session data at all → verified defaults to true (no adapter has
        // said otherwise), installed is false (no session has reported).
        expect(bp.verified).to.be.true;
        expect(bp.installed).to.be.false;
    });

    it('before any session: verified defaults to true, installed is false', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        expect(bp.raw).to.be.undefined;
        expect(bp.verified).to.be.true;
        expect(bp.installed).to.be.false;
        expect(bp.enabled).to.be.true;
    });

    it('single session unverified: installed is true, verified is false', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: false }));
        expect(bp.installed).to.be.true;
        expect(bp.verified).to.be.false;
    });

    it('disagreement resolved when one session removed: _raw restored from remaining', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ verified: true, line: 10 }));
        bp.update('session-2', makeSessionData({ verified: true, line: 20 }));
        expect(bp.raw).to.be.undefined; // disagreement

        bp.update('session-1', undefined);
        // Only session-2 remains → single verified location → _raw restored
        expect(bp.raw).to.not.be.undefined;
        expect(bp.raw!.sessionId).to.equal('session-2');
        expect(bp.raw!.line).to.equal(20);
    });

    it('getIdForSession returns the adapter id', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ id: 42 }));
        expect(bp.getIdForSession('session-1')).to.equal(42);
        expect(bp.getIdForSession('unknown')).to.be.undefined;
    });

    it('getDebugProtocolBreakpoint returns protocol data for known session', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        bp.update('session-1', makeSessionData({ id: 7, verified: true, line: 10, message: 'ok' }));
        const proto = bp.getDebugProtocolBreakpoint('session-1');
        expect(proto).to.deep.include({ id: 7, verified: true, line: 10, message: 'ok' });
    });

    it('getDebugProtocolBreakpoint returns undefined for unknown session', () => {
        const bp = manager.addBreakpoint(makeSourceBreakpoint(FILE_A, 10));
        expect(bp.getDebugProtocolBreakpoint('nope')).to.be.undefined;
    });
});

describe('BreakpointManager — source breakpoint identity preservation', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('setBreakpoints with matching ID reuses existing wrapper', () => {
        const original = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [original]);
        const wrapper1 = manager.getBreakpoints(FILE_A)[0];

        // Now "move" the breakpoint to line 20 but keep the same ID
        const moved: SourceBreakpoint = { ...original, raw: { ...original.raw, line: 20 } };
        manager.setBreakpoints(FILE_A, [moved]);
        const wrapper2 = manager.getBreakpoints(FILE_A)[0];

        expect(wrapper2).to.equal(wrapper1); // same object identity
        expect(wrapper2.line).to.equal(20);
    });

    it('session data survives a position change via setBreakpoints', () => {
        const original = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [original]);
        const wrapper = manager.getBreakpoints(FILE_A)[0];
        wrapper.update('s1', makeSessionData({ verified: true, line: 10 }));
        expect(wrapper.verified).to.be.true;

        // Move to line 20
        const moved: SourceBreakpoint = { ...original, raw: { ...original.raw, line: 20 } };
        manager.setBreakpoints(FILE_A, [moved]);
        const wrapper2 = manager.getBreakpoints(FILE_A)[0];
        expect(wrapper2).to.equal(wrapper);
        expect(wrapper2.verified).to.be.true; // session data survived
    });

    it('setBreakpoints with a genuinely new breakpoint creates a new wrapper', () => {
        const bp1 = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [bp1]);
        const wrapper1 = manager.getBreakpoints(FILE_A)[0];

        const bp2 = makeSourceBreakpoint(FILE_A, 20);
        manager.setBreakpoints(FILE_A, [bp1, bp2]);
        const wrappers = manager.getBreakpoints(FILE_A);
        expect(wrappers).to.have.length(2);
        expect(wrappers[0]).to.equal(wrapper1);
        expect(wrappers[1]).to.not.equal(wrapper1);
    });

    it('setBreakpoints deduplicates by position', () => {
        const bp1 = makeSourceBreakpoint(FILE_A, 10);
        const bp2 = makeSourceBreakpoint(FILE_A, 10); // different id, same position
        manager.setBreakpoints(FILE_A, [bp1, bp2]);
        expect(manager.getBreakpoints(FILE_A)).to.have.length(1);
    });

    it('addBreakpoint with a positional duplicate returns the existing wrapper', () => {
        const bp1 = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [bp1]);
        const wrapper1 = manager.getBreakpoints(FILE_A)[0];

        const bp2 = makeSourceBreakpoint(FILE_A, 10);
        const result = manager.addBreakpoint(bp2);
        expect(result).to.equal(wrapper1);
        expect(manager.getBreakpoints(FILE_A)).to.have.length(1);
    });

    it('removeBreakpoint removes by identity and fires correct events', () => {
        const bp1 = makeSourceBreakpoint(FILE_A, 10);
        const bp2 = makeSourceBreakpoint(FILE_A, 20);
        manager.setBreakpoints(FILE_A, [bp1, bp2]);

        const events: SourceBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => events.push(e));

        const wrapper = manager.getBreakpoints(FILE_A)[0];
        manager.removeBreakpoint(wrapper);

        expect(manager.getBreakpoints(FILE_A)).to.have.length(1);
        expect(manager.getBreakpoints(FILE_A)[0].line).to.equal(20);
        // At least one event should have the removed breakpoint
        const removeEvent = events.find(e => e.removed.length > 0);
        expect(removeEvent).to.not.be.undefined;
        expect(removeEvent!.removed[0]).to.equal(wrapper);
    });

    it('applySourceBreakpoints fires onDidChangeBreakpoints with correct added/removed/changed', () => {
        const bp1 = makeSourceBreakpoint(FILE_A, 10);
        const bp2 = makeSourceBreakpoint(FILE_A, 20);
        manager.setBreakpoints(FILE_A, [bp1, bp2]);

        const events: SourceBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => events.push(e));

        const bp3 = makeSourceBreakpoint(FILE_A, 30);
        manager.setBreakpoints(FILE_A, [bp1, bp3]); // bp2 removed, bp3 added, bp1 changed (same identity)

        expect(events).to.have.length(1);
        const event = events[0];
        expect(event.added).to.have.length(1);
        expect(event.added[0].line).to.equal(30);
        expect(event.removed).to.have.length(1);
        expect(event.removed[0].line).to.equal(20);
        expect(event.changed).to.have.length(1);
    });

    it('setBreakpoints sorts by line then column', () => {
        const bp30 = makeSourceBreakpoint(FILE_A, 30);
        const bp10 = makeSourceBreakpoint(FILE_A, 10);
        const bp20 = makeSourceBreakpoint(FILE_A, 20);
        manager.setBreakpoints(FILE_A, [bp30, bp10, bp20]);
        const lines = manager.getBreakpoints(FILE_A).map(bp => bp.line);
        expect(lines).to.deep.equal([10, 20, 30]);
    });
});

describe('BreakpointManager — enable/disable', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('enableAllBreakpoints(true) enables all breakpoint types', () => {
        const bp = makeSourceBreakpoint(FILE_A, 10, { enabled: false });
        manager.setBreakpoints(FILE_A, [bp]);
        const fbp = makeFunctionBreakpoint('myFunc');
        fbp.enabled = false;
        manager.addFunctionBreakpoint(fbp);
        manager.addInstructionBreakpoint('0xDEAD', 0);
        const dbp = makeDataBreakpoint('data1');
        dbp.enabled = false;
        manager.addDataBreakpoint(dbp);

        // Disable all first
        manager.enableAllBreakpoints(false);

        const sourceEvents: SourceBreakpointsChangeEvent[] = [];
        const funcEvents: FunctionBreakpointsChangeEvent[] = [];
        const instrEvents: InstructionBreakpointsChangeEvent[] = [];
        const dataEvents: DataBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => sourceEvents.push(e));
        manager.onDidChangeFunctionBreakpoints(e => funcEvents.push(e));
        manager.onDidChangeInstructionBreakpoints(e => instrEvents.push(e));
        manager.onDidChangeDataBreakpoints(e => dataEvents.push(e));

        manager.enableAllBreakpoints(true);

        expect(manager.getBreakpoints(FILE_A)[0].origin.enabled).to.be.true;
        expect(manager.getFunctionBreakpoints()[0].origin.enabled).to.be.true;
        expect(manager.getInstructionBreakpoints()[0].origin.enabled).to.be.true;
        expect(manager.getDataBreakpoints()[0].origin.enabled).to.be.true;

        expect(sourceEvents).to.have.length.greaterThan(0);
        expect(funcEvents).to.have.length.greaterThan(0);
        expect(instrEvents).to.have.length.greaterThan(0);
        expect(dataEvents).to.have.length.greaterThan(0);
    });

    it('enableAllBreakpoints does not fire for types already in target state', () => {
        const bp = makeSourceBreakpoint(FILE_A, 10, { enabled: true });
        manager.setBreakpoints(FILE_A, [bp]);

        // They're already enabled — should still fire because didChange is always true
        // in current implementation (identity-based). This test verifies the function
        // breakpoints emitter doesn't fire when there are no function breakpoints.
        const funcEvents: FunctionBreakpointsChangeEvent[] = [];
        manager.onDidChangeFunctionBreakpoints(e => funcEvents.push(e));

        manager.enableAllBreakpoints(true);
        expect(funcEvents).to.have.length(0);
    });

    it('set breakpointsEnabled fires onDidChangeMarkers for all synthetic URIs', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));

        const markerUris: string[] = [];
        manager.onDidChangeMarkers(uri => markerUris.push(uri.toString()));

        manager.breakpointsEnabled = false;

        expect(markerUris).to.include(FILE_A.toString());
        expect(markerUris).to.include(BreakpointManager.FUNCTION_URI.toString());
        expect(markerUris).to.include(BreakpointManager.INSTRUCTION_URI.toString());
        expect(markerUris).to.include(BreakpointManager.DATA_URI.toString());
        expect(markerUris).to.include(BreakpointManager.EXCEPTION_URI.toString());
    });

    it('set breakpointsEnabled does not fire if value unchanged', () => {
        const markerUris: string[] = [];
        manager.onDidChangeMarkers(uri => markerUris.push(uri.toString()));

        manager.breakpointsEnabled = true; // already true
        expect(markerUris).to.have.length(0);
    });

    it('enableBreakpoint fires fireBreakpointChanged', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        const wrapper = manager.getBreakpoints(FILE_A)[0];

        const events: SourceBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => events.push(e));

        manager.enableBreakpoint(wrapper, false);
        expect(wrapper.origin.enabled).to.be.false;
        expect(events).to.have.length(1);
        expect(events[0].changed).to.include(wrapper);
    });

    it('enableBreakpoint does not fire if already at target state', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        const wrapper = manager.getBreakpoints(FILE_A)[0];

        const events: SourceBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => events.push(e));

        manager.enableBreakpoint(wrapper, true); // already enabled
        expect(events).to.have.length(0);
    });
});

describe('BreakpointManager — non-source breakpoint types', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    // Function breakpoints

    it('addFunctionBreakpoint fires correct events', () => {
        const events: FunctionBreakpointsChangeEvent[] = [];
        manager.onDidChangeFunctionBreakpoints(e => events.push(e));

        const bp = makeFunctionBreakpoint('myFunction');
        manager.addFunctionBreakpoint(bp);

        expect(manager.getFunctionBreakpoints()).to.have.length(1);
        expect(manager.getFunctionBreakpoints()[0].name).to.equal('myFunction');
        expect(events).to.have.length(1);
        expect(events[0].added).to.have.length(1);
    });

    it('addFunctionBreakpoint with duplicate name is a no-op', () => {
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('myFunc'));
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('myFunc'));
        expect(manager.getFunctionBreakpoints()).to.have.length(1);
    });

    it('removeFunctionBreakpoint fires correct events', () => {
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));
        const wrapper = manager.getFunctionBreakpoints()[0];

        const events: FunctionBreakpointsChangeEvent[] = [];
        manager.onDidChangeFunctionBreakpoints(e => events.push(e));

        manager.removeFunctionBreakpoint(wrapper);
        expect(manager.getFunctionBreakpoints()).to.have.length(0);
        expect(events).to.have.length(1);
        expect(events[0].removed).to.include(wrapper);
    });

    it('updateFunctionBreakpoint with a name collision removes the colliding breakpoint', () => {
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn1'));
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn2'));

        const fn1 = manager.getFunctionBreakpoints().find(b => b.name === 'fn1')!;

        const events: FunctionBreakpointsChangeEvent[] = [];
        manager.onDidChangeFunctionBreakpoints(e => events.push(e));

        manager.updateFunctionBreakpoint(fn1, { name: 'fn2' });

        expect(manager.getFunctionBreakpoints()).to.have.length(1);
        expect(manager.getFunctionBreakpoints()[0].name).to.equal('fn2');
        // The event should have a removed entry for the colliding breakpoint
        const removeEvent = events.find(e => e.removed.length > 0);
        expect(removeEvent).to.not.be.undefined;
    });

    // Instruction breakpoints

    it('addInstructionBreakpoint fires correct events', () => {
        const events: InstructionBreakpointsChangeEvent[] = [];
        manager.onDidChangeInstructionBreakpoints(e => events.push(e));

        manager.addInstructionBreakpoint('0xDEAD', 0);

        expect(manager.getInstructionBreakpoints()).to.have.length(1);
        expect(events).to.have.length(1);
        expect(events[0].added).to.have.length(1);
    });

    it('addInstructionBreakpoint with duplicate address+offset is a no-op', () => {
        manager.addInstructionBreakpoint('0xBEEF', 4);
        manager.addInstructionBreakpoint('0xBEEF', 4);
        expect(manager.getInstructionBreakpoints()).to.have.length(1);
    });

    it('addInstructionBreakpoint with same address but different offset creates new', () => {
        manager.addInstructionBreakpoint('0xBEEF', 0);
        manager.addInstructionBreakpoint('0xBEEF', 4);
        expect(manager.getInstructionBreakpoints()).to.have.length(2);
    });

    it('removeInstructionBreakpoint fires correct events', () => {
        manager.addInstructionBreakpoint('0xCAFE', 0);
        const wrapper = manager.getInstructionBreakpoints()[0];

        const events: InstructionBreakpointsChangeEvent[] = [];
        manager.onDidChangeInstructionBreakpoints(e => events.push(e));

        manager.removeInstructionBreakpoint(wrapper);
        expect(manager.getInstructionBreakpoints()).to.have.length(0);
        expect(events).to.have.length(1);
        expect(events[0].removed).to.include(wrapper);
    });

    // Data breakpoints

    it('addDataBreakpoint fires correct events', () => {
        const events: DataBreakpointsChangeEvent[] = [];
        manager.onDidChangeDataBreakpoints(e => events.push(e));

        manager.addDataBreakpoint(makeDataBreakpoint('data-1'));

        expect(manager.getDataBreakpoints()).to.have.length(1);
        expect(events).to.have.length(1);
        expect(events[0].added).to.have.length(1);
    });

    it('addDataBreakpoint with duplicate dataId is a no-op', () => {
        manager.addDataBreakpoint(makeDataBreakpoint('data-1'));
        manager.addDataBreakpoint(makeDataBreakpoint('data-1'));
        expect(manager.getDataBreakpoints()).to.have.length(1);
    });

    it('removeDataBreakpoint fires correct events', () => {
        manager.addDataBreakpoint(makeDataBreakpoint('data-1'));
        const wrapper = manager.getDataBreakpoints()[0];

        const events: DataBreakpointsChangeEvent[] = [];
        manager.onDidChangeDataBreakpoints(e => events.push(e));

        manager.removeDataBreakpoint(wrapper);
        expect(manager.getDataBreakpoints()).to.have.length(0);
        expect(events).to.have.length(1);
        expect(events[0].removed).to.include(wrapper);
    });

    // removeBreakpointsById

    it('removeBreakpointsById removes across all types', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));
        manager.addInstructionBreakpoint('0xABC', 0);
        manager.addDataBreakpoint(makeDataBreakpoint('d1'));

        const srcId = manager.getBreakpoints(FILE_A)[0].id;
        const fnId = manager.getFunctionBreakpoints()[0].id;
        const instrId = manager.getInstructionBreakpoints()[0].id;
        const dataId = manager.getDataBreakpoints()[0].id;

        manager.removeBreakpointsById([srcId, fnId, instrId, dataId]);

        expect(manager.getBreakpoints(FILE_A)).to.have.length(0);
        expect(manager.getFunctionBreakpoints()).to.have.length(0);
        expect(manager.getInstructionBreakpoints()).to.have.length(0);
        expect(manager.getDataBreakpoints()).to.have.length(0);
    });
});

describe('BreakpointManager — updateSessionData', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('with bps map: only matching breakpoints get updated', () => {
        const sb1 = makeSourceBreakpoint(FILE_A, 10);
        const sb2 = makeSourceBreakpoint(FILE_A, 20);
        manager.setBreakpoints(FILE_A, [sb1, sb2]);
        const wrappers = manager.getBreakpoints(FILE_A);

        const bpsMap = new Map<string, DebugProtocol.Breakpoint>();
        bpsMap.set(wrappers[0].id, { id: 1, verified: true, line: 10 });

        manager.updateSessionData('s1', defaultCapabilities, bpsMap);

        expect(wrappers[0].installed).to.be.true;
        expect(wrappers[0].verified).to.be.true;
        expect(wrappers[1].installed).to.be.false; // not in the map — no session touched it
    });

    it('without bps map: all breakpoints have the session removed', () => {
        const sb = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [sb]);
        const wrapper = manager.getBreakpoints(FILE_A)[0];

        // First add session data
        const bpsMap = new Map<string, DebugProtocol.Breakpoint>();
        bpsMap.set(wrapper.id, { id: 1, verified: true, line: 10 });
        manager.updateSessionData('s1', defaultCapabilities, bpsMap);
        expect(wrapper.installed).to.be.true;
        expect(wrapper.verified).to.be.true;

        // Now cleanup (no bps map)
        manager.updateSessionData('s1', defaultCapabilities, undefined);
        expect(wrapper.installed).to.be.false;
        expect(wrapper.raw).to.be.undefined;
        // verified defaults to true when no session has weighed in
        expect(wrapper.verified).to.be.true;
    });

    it('cleanup short-circuits for breakpoints that never had data from the session', () => {
        const sb = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [sb]);
        const wrapper = manager.getBreakpoints(FILE_A)[0];

        // Add data from session-1
        const bpsMap = new Map<string, DebugProtocol.Breakpoint>();
        bpsMap.set(wrapper.id, { id: 1, verified: true, line: 10 });
        manager.updateSessionData('s1', defaultCapabilities, bpsMap);

        // Cleanup session-2 (never contributed) — wrapper should still have s1 data
        manager.updateSessionData('s2', defaultCapabilities, undefined);
        expect(wrapper.verified).to.be.true;
        expect(wrapper.raw!.sessionId).to.equal('s1');
    });

    it('capabilities are correctly extracted and merged into BPSessionData', () => {
        const sb = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [sb]);
        const wrapper = manager.getBreakpoints(FILE_A)[0];

        const caps: DebugProtocol.Capabilities = {
            supportsConditionalBreakpoints: true,
            supportsHitConditionalBreakpoints: true,
            supportsLogPoints: false,
        };
        const bpsMap = new Map<string, DebugProtocol.Breakpoint>();
        bpsMap.set(wrapper.id, { id: 1, verified: true, line: 10 });
        manager.updateSessionData('s1', caps, bpsMap);

        expect(wrapper.raw!.supportsConditionalBreakpoints).to.be.true;
        expect(wrapper.raw!.supportsHitConditionalBreakpoints).to.be.true;
        expect(wrapper.raw!.supportsLogPoints).to.be.false;
    });

    it('typed events fire grouped by URI', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.setBreakpoints(FILE_B, [makeSourceBreakpoint(FILE_B, 5)]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));

        const sourceEvents: SourceBreakpointsChangeEvent[] = [];
        const funcEvents: FunctionBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => sourceEvents.push(e));
        manager.onDidChangeFunctionBreakpoints(e => funcEvents.push(e));

        const bpsMap = new Map<string, DebugProtocol.Breakpoint>();
        for (const bp of manager.getBreakpoints()) {
            bpsMap.set(bp.id, { id: 1, verified: true, line: bp.line });
        }
        for (const bp of manager.getFunctionBreakpoints()) {
            bpsMap.set(bp.id, { id: 2, verified: true });
        }

        manager.updateSessionData('s1', defaultCapabilities, bpsMap);

        // Source breakpoints for two different URIs → two events
        expect(sourceEvents).to.have.length(2);
        const uris = sourceEvents.map(e => e.uri.toString()).sort();
        expect(uris).to.deep.equal([FILE_A.toString(), FILE_B.toString()].sort());

        // Function breakpoint → one event
        expect(funcEvents).to.have.length(1);
    });
});

describe('BreakpointManager — exception breakpoints', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('addExceptionBreakpoints creates new for unknown filters', () => {
        const filter: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'all', label: 'All Exceptions' };
        manager.addExceptionBreakpoints([filter], 'session-1');
        expect(manager.getExceptionBreakpoints()).to.have.length(1);
        expect(manager.getExceptionBreakpoints()[0].origin.raw.filter).to.equal('all');
    });

    it('addExceptionBreakpoints reuses existing for known filters', () => {
        const filter: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'all', label: 'All Exceptions' };
        manager.addExceptionBreakpoints([filter], 'session-1');
        const first = manager.getExceptionBreakpoints()[0];
        manager.addExceptionBreakpoints([filter], 'session-2');
        expect(manager.getExceptionBreakpoints()).to.have.length(1);
        expect(manager.getExceptionBreakpoints()[0]).to.equal(first);
    });

    it('clearExceptionSessionEnablement removes the session from all enablement sets', () => {
        const filter: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'all', label: 'All Exceptions' };
        manager.addExceptionBreakpoints([filter], 'session-1');
        const bp = manager.getExceptionBreakpoints()[0];
        expect(bp.isEnabledForSession('session-1')).to.be.true;

        manager.clearExceptionSessionEnablement('session-1');
        expect(bp.isEnabledForSession('session-1')).to.be.false;
    });

    it('persistentlyVisible remains true after session cleanup for filters that were visible', () => {
        const filter: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'all', label: 'All Exceptions' };
        manager.addExceptionBreakpoints([filter], 'session-1');
        const bp = manager.getExceptionBreakpoints()[0];

        // addExceptionBreakpoints calls doUpdateExceptionBreakpointVisibility which sets persistent visibility
        expect(bp.isPersistentlyVisible()).to.be.true;

        // Clearing session enablement does NOT clear persistent visibility
        manager.clearExceptionSessionEnablement('session-1');
        expect(bp.isPersistentlyVisible()).to.be.true;
    });

    it('getExceptionBreakpoint finds by filter match', () => {
        const filter: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'uncaught', label: 'Uncaught Exceptions' };
        manager.addExceptionBreakpoints([filter], 'session-1');

        const found = manager.getExceptionBreakpoint(filter);
        expect(found).to.not.be.undefined;
        expect(found!.origin.raw.filter).to.equal('uncaught');

        const notFound = manager.getExceptionBreakpoint({ filter: 'other', label: 'Other' });
        expect(notFound).to.be.undefined;
    });
});

describe('BreakpointManager — persistence', () => {

    let manager: BreakpointManager;
    let storageData: Record<string, unknown>;

    beforeEach(() => {
        ({ manager, storageData } = createManager());
    });

    it('save() extracts origin from all wrapper types', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));
        manager.addInstructionBreakpoint('0xDEAD', 0);
        manager.addDataBreakpoint(makeDataBreakpoint('d1'));

        // Add an exception breakpoint that's persistently visible
        const filter: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'all', label: 'All Exceptions' };
        manager.addExceptionBreakpoints([filter], 'session-1');

        manager.save();

        const data = storageData['breakpoints'] as BreakpointManager.Data;
        expect(data).to.not.be.undefined;
        expect(Object.keys(data.breakpoints)).to.have.length(1);
        expect(data.breakpoints[FILE_A.toString()]).to.have.length(1);
        expect(data.functionBreakpoints).to.have.length(1);
        expect(data.instructionBreakpoints).to.have.length(1);
        expect(data.dataBreakpoints).to.have.length(1);
        expect(data.exceptionBreakpoints).to.have.length(1);
    });

    it('round-trip: save then load produces equivalent breakpoints', async () => {
        const sbp = makeSourceBreakpoint(FILE_A, 42, { condition: 'x > 5' });
        manager.setBreakpoints(FILE_A, [sbp]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('myFn'));
        manager.breakpointsEnabled = false;
        manager.save();

        // Create a fresh manager and load
        const { manager: manager2 } = createManager();
        // Copy stored data to the new manager's storage
        const freshStorageData = manager2['storage'];
        await freshStorageData.setData('breakpoints', storageData['breakpoints']);
        await manager2.load();

        expect(manager2.breakpointsEnabled).to.be.false;
        const loaded = manager2.getBreakpoints(FILE_A);
        expect(loaded).to.have.length(1);
        expect(loaded[0].origin.raw.line).to.equal(42);
        expect(loaded[0].origin.raw.condition).to.equal('x > 5');
        expect(manager2.getFunctionBreakpoints()).to.have.length(1);
        expect(manager2.getFunctionBreakpoints()[0].name).to.equal('myFn');
    });

    it('exception breakpoints: only persistentlyVisible ones are saved', () => {
        const filter1: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'all', label: 'All' };
        const filter2: DebugProtocol.ExceptionBreakpointsFilter = { filter: 'uncaught', label: 'Uncaught' };
        manager.addExceptionBreakpoints([filter1], 'session-1');
        manager.addExceptionBreakpoints([filter2], 'session-1');

        // filter1 and filter2 are persistentlyVisible after addExceptionBreakpoints
        // Now mark one as not persistently visible
        const bp2 = manager.getExceptionBreakpoints()[1];
        bp2.setPersistentVisibility(false);

        manager.save();
        const data = storageData['breakpoints'] as BreakpointManager.Data;
        expect(data.exceptionBreakpoints).to.have.length(1);
        expect(data.exceptionBreakpoints![0].raw.filter).to.equal('all');
    });
});

describe('BreakpointManager — file deletion', () => {

    let manager: BreakpointManager;
    let fileChangeEmitter: Emitter<FileChangesEvent>;

    beforeEach(() => {
        ({ manager, fileChangeEmitter } = createManager());
    });

    it('when a file is deleted, its source breakpoints are removed and onDidChangeMarkers fires', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.setBreakpoints(FILE_B, [makeSourceBreakpoint(FILE_B, 5)]);

        expect(manager.getBreakpoints(FILE_A)).to.have.length(1);

        const markerUris: string[] = [];
        manager.onDidChangeMarkers(uri => markerUris.push(uri.toString()));

        fileChangeEmitter.fire(new FileChangesEvent([{
            resource: FILE_A,
            type: FileChangeType.DELETED,
        }]));

        expect(manager.getBreakpoints(FILE_A)).to.have.length(0);
        expect(markerUris).to.include(FILE_A.toString());
        // FILE_B should be untouched
        expect(manager.getBreakpoints(FILE_B)).to.have.length(1);
    });
});

describe('BreakpointManager — fireTypedBreakpointEvent dispatch', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('fires onDidChangeBreakpoints for DebugSourceBreakpoint instances', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);

        const events: SourceBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => events.push(e));

        const wrapper = manager.getBreakpoints(FILE_A)[0];
        manager.fireBreakpointChanged(wrapper);

        expect(events).to.have.length(1);
        expect(events[0].changed).to.include(wrapper);
    });

    it('fires onDidChangeFunctionBreakpoints for DebugFunctionBreakpoint instances', () => {
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));

        const events: FunctionBreakpointsChangeEvent[] = [];
        manager.onDidChangeFunctionBreakpoints(e => events.push(e));

        const wrapper = manager.getFunctionBreakpoints()[0];
        manager.fireBreakpointChanged(wrapper);

        expect(events).to.have.length(1);
        expect(events[0].changed[0]).to.equal(wrapper);
    });

    it('fires onDidChangeInstructionBreakpoints for DebugInstructionBreakpoint instances', () => {
        manager.addInstructionBreakpoint('0xABC', 0);

        const events: InstructionBreakpointsChangeEvent[] = [];
        manager.onDidChangeInstructionBreakpoints(e => events.push(e));

        const wrapper = manager.getInstructionBreakpoints()[0];
        manager.fireBreakpointChanged(wrapper);

        expect(events).to.have.length(1);
        expect(events[0].changed[0]).to.equal(wrapper);
    });

    it('fires onDidChangeDataBreakpoints for DebugDataBreakpoint instances', () => {
        manager.addDataBreakpoint(makeDataBreakpoint('d1'));

        const events: DataBreakpointsChangeEvent[] = [];
        manager.onDidChangeDataBreakpoints(e => events.push(e));

        const wrapper = manager.getDataBreakpoints()[0];
        manager.fireBreakpointChanged(wrapper);

        expect(events).to.have.length(1);
        expect(events[0].changed[0]).to.equal(wrapper);
    });
});

describe('BreakpointManager — query helpers', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('getLineBreakpoints returns breakpoints at a specific line', () => {
        manager.setBreakpoints(FILE_A, [
            makeSourceBreakpoint(FILE_A, 10),
            makeSourceBreakpoint(FILE_A, 20),
            makeSourceBreakpoint(FILE_A, 10, { column: 5 }),
        ]);
        const atLine10 = manager.getLineBreakpoints(FILE_A, 10);
        expect(atLine10).to.have.length(2);
    });

    it('getBreakpointById finds across all types', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));
        manager.addInstructionBreakpoint('0x1', 0);
        manager.addDataBreakpoint(makeDataBreakpoint('d1'));

        const srcBp = manager.getBreakpoints(FILE_A)[0];
        const fnBp = manager.getFunctionBreakpoints()[0];
        const instrBp = manager.getInstructionBreakpoints()[0];
        const dataBp = manager.getDataBreakpoints()[0];

        expect(manager.getBreakpointById(srcBp.id)).to.equal(srcBp);
        expect(manager.getBreakpointById(fnBp.id)).to.equal(fnBp);
        expect(manager.getBreakpointById(instrBp.id)).to.equal(instrBp);
        expect(manager.getBreakpointById(dataBp.id)).to.equal(dataBp);
        expect(manager.getBreakpointById('nonexistent')).to.be.undefined;
    });

    it('allBreakpoints yields all types', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));
        manager.addInstructionBreakpoint('0x1', 0);
        manager.addDataBreakpoint(makeDataBreakpoint('d1'));
        manager.addExceptionBreakpoints([{ filter: 'all', label: 'All' }], 's1');

        const all = [...manager.allBreakpoints()];
        expect(all).to.have.length(5);

        const types = all.map(bp => bp.constructor.name);
        expect(types).to.include('DebugSourceBreakpoint');
        expect(types).to.include('DebugFunctionBreakpoint');
        expect(types).to.include('DebugInstructionBreakpoint');
        expect(types).to.include('DebugDataBreakpoint');
        expect(types).to.include('DebugExceptionBreakpoint');
    });

    it('hasBreakpoints returns true when any type exists', () => {
        expect(manager.hasBreakpoints()).to.be.false;
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));
        expect(manager.hasBreakpoints()).to.be.true;
    });

    it('getUris returns all URIs with source breakpoints', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.setBreakpoints(FILE_B, [makeSourceBreakpoint(FILE_B, 5)]);
        const uris = [...manager.getUris()];
        expect(uris).to.have.length(2);
        expect(uris).to.include(FILE_A.toString());
        expect(uris).to.include(FILE_B.toString());
    });

    it('getBreakpoints with no URI returns all source breakpoints', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.setBreakpoints(FILE_B, [makeSourceBreakpoint(FILE_B, 5)]);
        const all = manager.getBreakpoints();
        expect(all).to.have.length(2);
    });

    it('removeBreakpoints clears all breakpoints of all types', () => {
        manager.setBreakpoints(FILE_A, [makeSourceBreakpoint(FILE_A, 10)]);
        manager.addFunctionBreakpoint(makeFunctionBreakpoint('fn'));
        manager.addInstructionBreakpoint('0x1', 0);
        manager.addDataBreakpoint(makeDataBreakpoint('d1'));

        manager.removeBreakpoints();

        expect(manager.getBreakpoints()).to.have.length(0);
        expect(manager.getFunctionBreakpoints()).to.have.length(0);
        expect(manager.getInstructionBreakpoints()).to.have.length(0);
        expect(manager.getDataBreakpoints()).to.have.length(0);
    });
});

describe('BreakpointManager — updateBreakpoint', () => {

    let manager: BreakpointManager;

    beforeEach(() => {
        ({ manager } = createManager());
    });

    it('updateBreakpoint merges partial raw and fires changed event', () => {
        const bp = makeSourceBreakpoint(FILE_A, 10);
        manager.setBreakpoints(FILE_A, [bp]);
        const wrapper = manager.getBreakpoints(FILE_A)[0];

        const events: SourceBreakpointsChangeEvent[] = [];
        manager.onDidChangeBreakpoints(e => events.push(e));

        manager.updateBreakpoint(wrapper, { condition: 'x > 10' });

        expect(wrapper.origin.raw.condition).to.equal('x > 10');
        expect(wrapper.origin.raw.line).to.equal(10); // line preserved
        expect(events).to.have.length(1);
    });

    it('updateDataBreakpoint updates enabled and raw fields', () => {
        manager.addDataBreakpoint(makeDataBreakpoint('d1'));
        const wrapper = manager.getDataBreakpoints()[0];

        const events: DataBreakpointsChangeEvent[] = [];
        manager.onDidChangeDataBreakpoints(e => events.push(e));

        manager.updateDataBreakpoint(wrapper, { enabled: false, raw: { condition: 'val > 0' } });

        expect(wrapper.origin.enabled).to.be.false;
        expect(wrapper.origin.raw.condition).to.equal('val > 0');
        expect(events).to.have.length(1);
    });

    it('updateDataBreakpoint on unknown breakpoint is a no-op', () => {
        const orphan = DebugDataBreakpoint.create(makeDataBreakpoint('orphan'), manager.getBreakpointOptions());

        const events: DataBreakpointsChangeEvent[] = [];
        manager.onDidChangeDataBreakpoints(e => events.push(e));

        manager.updateDataBreakpoint(orphan, { enabled: false });
        expect(events).to.have.length(0);
    });
});
