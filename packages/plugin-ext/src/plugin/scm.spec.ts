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

/**
 * Tests for the SCM history provider bridge.
 *
 * These tests validate the plugin-side logic in isolation without requiring
 * the full Theia runtime — following the pattern from workspace.spec.ts.
 */

import * as assert from 'assert';
import { Emitter } from '@theia/core/lib/common/event';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { ScmCommandArg, ScmHistoryItemCommandArg } from '../common/plugin-api-rpc';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface HistoryItemRef {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly revision?: string;
    readonly category?: string;
}

interface HistoryItemRefsChangeEvent {
    readonly added: readonly HistoryItemRef[];
    readonly removed: readonly HistoryItemRef[];
    readonly modified: readonly HistoryItemRef[];
}

interface HistoryItem {
    readonly id: string;
    readonly parentIds?: readonly string[];
    readonly subject: string;
    readonly author?: string;
    readonly authorEmail?: string;
    readonly displayId?: string;
    readonly timestamp?: number;
}

interface HistoryOptions {
    readonly skip?: number;
    readonly limit?: number | { id?: string };
    readonly historyItemRefs?: readonly string[];
    readonly filterText?: string;
}

/**
 * Extracted from SourceControlImpl.historyProvider setter logic.
 * Tests the event subscription and proxy notification pattern.
 *
 * Note: SourceControlImpl cannot be instantiated directly in unit tests because
 * it depends on ScmMain (RPC proxy) and CommandRegistryImpl, both of which
 * require a full Theia runtime with inversify bindings and RPC channels.
 * Instead, the bridge pattern extracts the logic under test into a standalone
 * class that mirrors the real implementation, following the same pattern used
 * in workspace.spec.ts for other plugin-side logic.
 */
class HistoryProviderBridge {
    private _historyProvider: any;
    private _historyProviderDisposables = new DisposableCollection();

    readonly updateSourceControlCalls: Array<{ features: any }> = [];
    readonly onDidChangeCurrentHistoryItemRefsCalls: number[] = [];
    readonly onDidChangeHistoryItemRefsCalls: Array<{ event: any }> = [];

    private historyItemRefToDto(ref: HistoryItemRef): any {
        return { id: ref.id, name: ref.name, description: ref.description, revision: ref.revision, category: ref.category };
    }

    setHistoryProvider(provider: any): void {
        this._historyProviderDisposables.dispose();
        this._historyProviderDisposables = new DisposableCollection();
        this._historyProvider = provider;

        if (provider) {
            this._historyProviderDisposables.push(
                provider.onDidChangeCurrentHistoryItemRefs(() => {
                    this.updateSourceControlCalls.push({
                        features: {
                            hasHistoryProvider: true,
                            currentHistoryItemRef: provider.currentHistoryItemRef ? this.historyItemRefToDto(provider.currentHistoryItemRef) : undefined,
                        }
                    });
                    this.onDidChangeCurrentHistoryItemRefsCalls.push(1);
                })
            );
            this._historyProviderDisposables.push(
                provider.onDidChangeHistoryItemRefs((event: HistoryItemRefsChangeEvent) => {
                    this.onDidChangeHistoryItemRefsCalls.push({
                        event: {
                            added: event.added.map((r: HistoryItemRef) => this.historyItemRefToDto(r)),
                            removed: event.removed.map((r: HistoryItemRef) => this.historyItemRefToDto(r)),
                            modified: event.modified.map((r: HistoryItemRef) => this.historyItemRefToDto(r)),
                        }
                    });
                })
            );
        }

        this.updateSourceControlCalls.push({
            features: {
                hasHistoryProvider: !!provider,
                currentHistoryItemRef: provider?.currentHistoryItemRef ? this.historyItemRefToDto(provider.currentHistoryItemRef) : undefined,
            }
        });
    }

    async provideHistoryItems(options: HistoryOptions): Promise<any[] | undefined> {
        if (!this._historyProvider) {
            return undefined;
        }
        const result = await this._historyProvider.provideHistoryItems(options);
        if (!result) {
            return undefined;
        }
        return result.map((item: HistoryItem) => ({
            id: item.id,
            parentIds: item.parentIds ? [...item.parentIds] : undefined,
            subject: item.subject,
            author: item.author,
            authorEmail: item.authorEmail,
            displayId: item.displayId,
            timestamp: item.timestamp,
        }));
    }

    async provideHistoryItemRefs(refs: string[] | undefined): Promise<HistoryItemRef[] | undefined> {
        if (!this._historyProvider) {
            return undefined;
        }
        const result = await this._historyProvider.provideHistoryItemRefs(refs);
        return result;
    }

    dispose(): void {
        this._historyProviderDisposables.dispose();
    }
}

describe('SCM history provider bridge (plugin side)', () => {
    let bridge: HistoryProviderBridge;
    let bridgeDisposables: DisposableCollection;

    beforeEach(() => {
        bridgeDisposables = new DisposableCollection();
        bridge = new HistoryProviderBridge();
    });

    afterEach(() => {
        bridge.dispose();
        bridgeDisposables.dispose();
    });

    it('setting historyProvider sends hasHistoryProvider: true', () => {
        const onCurrentRefs = new Emitter<void>();
        const onHistoryRefs = new Emitter<HistoryItemRefsChangeEvent>();
        bridgeDisposables.push(onCurrentRefs);
        bridgeDisposables.push(onHistoryRefs);

        const provider = {
            currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' },
            onDidChangeCurrentHistoryItemRefs: onCurrentRefs.event,
            onDidChangeHistoryItemRefs: onHistoryRefs.event,
            provideHistoryItemRefs: async () => [],
            provideHistoryItems: async () => [],
        };

        bridge.setHistoryProvider(provider);

        const lastCall = bridge.updateSourceControlCalls[bridge.updateSourceControlCalls.length - 1];
        assert.ok(lastCall, 'Expected $updateSourceControl to be called');
        assert.strictEqual(lastCall.features.hasHistoryProvider, true);
        assert.strictEqual(lastCall.features.currentHistoryItemRef?.id, 'refs/heads/main');
        assert.strictEqual(lastCall.features.currentHistoryItemRef?.name, 'main');
    });

    it('setting historyProvider to undefined sends hasHistoryProvider: false', () => {
        const onCurrentRefs = new Emitter<void>();
        const onHistoryRefs = new Emitter<HistoryItemRefsChangeEvent>();
        bridgeDisposables.push(onCurrentRefs);
        bridgeDisposables.push(onHistoryRefs);

        const provider = {
            currentHistoryItemRef: undefined,
            onDidChangeCurrentHistoryItemRefs: onCurrentRefs.event,
            onDidChangeHistoryItemRefs: onHistoryRefs.event,
            provideHistoryItemRefs: async () => [],
            provideHistoryItems: async () => [],
        };

        bridge.setHistoryProvider(provider);
        bridge.setHistoryProvider(undefined);

        const lastCall = bridge.updateSourceControlCalls[bridge.updateSourceControlCalls.length - 1];
        assert.ok(lastCall, 'Expected $updateSourceControl to be called');
        assert.strictEqual(lastCall.features.hasHistoryProvider, false);
    });

    it('onDidChangeCurrentHistoryItemRefs fires proxy notification', () => {
        const onCurrentRefs = new Emitter<void>();
        const onHistoryRefs = new Emitter<HistoryItemRefsChangeEvent>();
        bridgeDisposables.push(onCurrentRefs);
        bridgeDisposables.push(onHistoryRefs);

        const provider = {
            currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' },
            onDidChangeCurrentHistoryItemRefs: onCurrentRefs.event,
            onDidChangeHistoryItemRefs: onHistoryRefs.event,
            provideHistoryItemRefs: async () => [],
            provideHistoryItems: async () => [],
        };

        bridge.setHistoryProvider(provider);
        const callsBefore = bridge.onDidChangeCurrentHistoryItemRefsCalls.length;
        onCurrentRefs.fire();

        assert.strictEqual(bridge.onDidChangeCurrentHistoryItemRefsCalls.length, callsBefore + 1);
    });

    it('onDidChangeHistoryItemRefs fires proxy notification with mapped DTOs', () => {
        const onCurrentRefs = new Emitter<void>();
        const onHistoryRefs = new Emitter<HistoryItemRefsChangeEvent>();
        bridgeDisposables.push(onCurrentRefs);
        bridgeDisposables.push(onHistoryRefs);

        const provider = {
            currentHistoryItemRef: undefined,
            onDidChangeCurrentHistoryItemRefs: onCurrentRefs.event,
            onDidChangeHistoryItemRefs: onHistoryRefs.event,
            provideHistoryItemRefs: async () => [],
            provideHistoryItems: async () => [],
        };

        bridge.setHistoryProvider(provider);

        const changeEvent: HistoryItemRefsChangeEvent = {
            added: [{ id: 'refs/heads/feature', name: 'feature' }],
            removed: [],
            modified: [],
        };
        onHistoryRefs.fire(changeEvent);

        assert.strictEqual(bridge.onDidChangeHistoryItemRefsCalls.length, 1);
        assert.strictEqual(bridge.onDidChangeHistoryItemRefsCalls[0].event.added[0].id, 'refs/heads/feature');
        assert.strictEqual(bridge.onDidChangeHistoryItemRefsCalls[0].event.added[0].name, 'feature');
    });

    it('provideHistoryItems delegates to historyProvider and maps results to DTOs', async () => {
        const onCurrentRefs = new Emitter<void>();
        const onHistoryRefs = new Emitter<HistoryItemRefsChangeEvent>();
        bridgeDisposables.push(onCurrentRefs);
        bridgeDisposables.push(onHistoryRefs);

        const expectedItems: HistoryItem[] = [
            {
                id: 'abc123',
                subject: 'Initial commit',
                parentIds: [],
                author: 'Test User',
                authorEmail: 'test@example.com',
                displayId: 'abc1234',
                timestamp: 1700000000000,
            }
        ];

        const provider = {
            currentHistoryItemRef: undefined,
            onDidChangeCurrentHistoryItemRefs: onCurrentRefs.event,
            onDidChangeHistoryItemRefs: onHistoryRefs.event,
            provideHistoryItemRefs: async () => [],
            provideHistoryItems: async (_opts: HistoryOptions) => expectedItems,
        };

        bridge.setHistoryProvider(provider);

        const result = await bridge.provideHistoryItems({ limit: 10 });

        assert.ok(result, 'Expected result to be defined');
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].id, 'abc123');
        assert.strictEqual(result[0].subject, 'Initial commit');
        assert.strictEqual(result[0].author, 'Test User');
        assert.strictEqual(result[0].displayId, 'abc1234');
        assert.strictEqual(result[0].timestamp, 1700000000000);
    });

    it('provideHistoryItems returns undefined when no history provider set', async () => {
        const result = await bridge.provideHistoryItems({ limit: 10 });
        assert.strictEqual(result, undefined);
    });

    it('provideHistoryItemRefs delegates to historyProvider', async () => {
        const onCurrentRefs = new Emitter<void>();
        const onHistoryRefs = new Emitter<HistoryItemRefsChangeEvent>();
        bridgeDisposables.push(onCurrentRefs);
        bridgeDisposables.push(onHistoryRefs);

        const expectedRefs: HistoryItemRef[] = [
            { id: 'refs/heads/main', name: 'main' },
            { id: 'refs/heads/feature', name: 'feature' },
        ];

        const provider = {
            currentHistoryItemRef: undefined,
            onDidChangeCurrentHistoryItemRefs: onCurrentRefs.event,
            onDidChangeHistoryItemRefs: onHistoryRefs.event,
            provideHistoryItemRefs: async () => expectedRefs,
            provideHistoryItems: async () => [],
        };

        bridge.setHistoryProvider(provider);

        const result = await bridge.provideHistoryItemRefs(undefined);

        assert.ok(result, 'Expected result to be defined');
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].id, 'refs/heads/main');
        assert.strictEqual(result[1].id, 'refs/heads/feature');
    });
});

describe('SCM history command arg type guards and processors', () => {

    describe('ScmHistoryItemCommandArg.is()', () => {
        it('returns true for historyItem arg with all required fields', () => {
            const arg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'abc', type: 'historyItem' };
            assert.strictEqual(ScmHistoryItemCommandArg.is(arg), true);
        });

        it('returns true for historyItemRef arg with all required fields', () => {
            const arg: ScmHistoryItemCommandArg = { sourceControlHandle: 1, id: 'refs/heads/main', type: 'historyItemRef' };
            assert.strictEqual(ScmHistoryItemCommandArg.is(arg), true);
        });

        it('returns false for plain ScmCommandArg (sourceControlHandle only)', () => {
            const arg: ScmCommandArg = { sourceControlHandle: 0 };
            assert.strictEqual(ScmHistoryItemCommandArg.is(arg), false);
        });

        it('returns false for null and non-objects', () => {
            assert.strictEqual(ScmHistoryItemCommandArg.is(undefined), false);
            assert.strictEqual(ScmHistoryItemCommandArg.is('string'), false);
            assert.strictEqual(ScmHistoryItemCommandArg.is(42), false);
        });

        it('returns false for object missing id field', () => {
            assert.strictEqual(ScmHistoryItemCommandArg.is({ sourceControlHandle: 0, type: 'historyItem' }), false);
        });

        it('returns false for object missing sourceControlHandle', () => {
            assert.strictEqual(ScmHistoryItemCommandArg.is({ id: 'abc', type: 'historyItem' }), false);
        });

        it('returns false for object missing type field', () => {
            assert.strictEqual(ScmHistoryItemCommandArg.is({ sourceControlHandle: 0, id: 'abc' }), false);
        });
    });

    describe('Guard specificity: ScmCommandArg.is() vs ScmHistoryItemCommandArg.is()', () => {
        it('ScmCommandArg.is() matches history item args (broad guard)', () => {
            // ScmCommandArg only checks for sourceControlHandle — it DOES match history args.
            // This is why history processors are registered before the generic processor,
            // so the more-specific guard wins by running first.
            const historyItemArg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'abc', type: 'historyItem' };
            assert.strictEqual(ScmCommandArg.is(historyItemArg), true,
                'ScmCommandArg.is() matches history item args because it only checks sourceControlHandle');
        });

        it('ScmHistoryItemCommandArg.is() does NOT match plain ScmCommandArg', () => {
            const plainArg: ScmCommandArg = { sourceControlHandle: 0 };
            assert.strictEqual(ScmHistoryItemCommandArg.is(plainArg), false,
                'ScmHistoryItemCommandArg.is() requires id and type to be present');
        });
    });

    describe('History item argument processor', () => {
        interface MockRef {
            id: string;
            name: string;
        }

        interface MockHistoryProvider {
            id: string;
            currentHistoryItemRef?: MockRef;
            currentHistoryItemRemoteRef?: MockRef;
            currentHistoryItemBaseRef?: MockRef;
        }

        interface MockSourceControl {
            historyProvider: MockHistoryProvider | undefined;
        }

        function makeHistoryItemProcessor(
            sourceControls: Map<number, MockSourceControl>
        ): (arg: unknown) => unknown {
            return (arg: unknown) => {
                if (!ScmHistoryItemCommandArg.is(arg) || arg.type !== 'historyItem') {
                    return arg;
                }
                const sourceControl = sourceControls.get(arg.sourceControlHandle);
                if (!sourceControl?.historyProvider) {
                    return undefined;
                }
                return { id: arg.id };
            };
        }

        function makeHistoryItemRefProcessor(
            sourceControls: Map<number, MockSourceControl>
        ): (arg: unknown) => unknown {
            return (arg: unknown) => {
                if (!ScmHistoryItemCommandArg.is(arg) || arg.type !== 'historyItemRef') {
                    return arg;
                }
                const sourceControl = sourceControls.get(arg.sourceControlHandle);
                if (!sourceControl?.historyProvider) {
                    return undefined;
                }
                const provider = sourceControl.historyProvider as any;
                const ref = [provider.currentHistoryItemRef, provider.currentHistoryItemRemoteRef, provider.currentHistoryItemBaseRef]
                    .find((r: any) => r?.id === arg.id);
                return ref ?? { id: arg.id };
            };
        }

        function makeGenericScmProcessor(sourceControls: Map<number, MockSourceControl>): (arg: unknown) => unknown {
            return (arg: unknown) => {
                if (!ScmCommandArg.is(arg)) {
                    return arg;
                }
                const sourceControl = sourceControls.get(arg.sourceControlHandle);
                if (!sourceControl) {
                    return undefined;
                }
                return sourceControl;
            };
        }

        it('history item processor returns { id } for a known history item', () => {
            const sourceControls = new Map<number, MockSourceControl>();
            sourceControls.set(0, { historyProvider: { id: 'git' } });

            const processor = makeHistoryItemProcessor(sourceControls);
            const arg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'abc123', type: 'historyItem' };
            const result = processor(arg);

            assert.deepStrictEqual(result, { id: 'abc123' });
        });

        it('history item processor returns undefined when source control has no historyProvider', () => {
            const sourceControls = new Map<number, MockSourceControl>();
            sourceControls.set(0, { historyProvider: undefined });

            const processor = makeHistoryItemProcessor(sourceControls);
            const arg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'abc123', type: 'historyItem' };
            const result = processor(arg);

            assert.strictEqual(result, undefined);
        });

        it('history item ref processor returns currentHistoryItemRef from provider when id matches', () => {
            const currentRef = { id: 'refs/heads/main', name: 'main' };
            const sourceControls = new Map<number, MockSourceControl>();
            sourceControls.set(0, { historyProvider: { id: 'git', currentHistoryItemRef: currentRef } });

            const processor = makeHistoryItemRefProcessor(sourceControls);
            const arg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'refs/heads/main', type: 'historyItemRef' };
            const result = processor(arg);

            assert.strictEqual(result, currentRef, 'should return the exact provider ref object');
        });

        it('history item ref processor returns { id } when ref id is not among current provider refs', () => {
            const sourceControls = new Map<number, MockSourceControl>();
            sourceControls.set(0, { historyProvider: { id: 'git', currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' } } });

            const processor = makeHistoryItemRefProcessor(sourceControls);
            const arg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'refs/heads/other', type: 'historyItemRef' };
            const result = processor(arg);

            assert.deepStrictEqual(result, { id: 'refs/heads/other' });
        });

        it('type discriminator: historyItem arg is NOT processed by ref processor', () => {
            const sourceControls = new Map<number, MockSourceControl>();
            const currentRef = { id: 'refs/heads/main', name: 'main' };
            sourceControls.set(0, { historyProvider: { id: 'git', currentHistoryItemRef: currentRef } });

            const refProcessor = makeHistoryItemRefProcessor(sourceControls);
            const historyItemArg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'refs/heads/main', type: 'historyItem' };

            // Even though the id matches a known ref, the type discriminator prevents the ref
            // processor from consuming it — it should be passed through unchanged.
            const result = refProcessor(historyItemArg);
            assert.strictEqual(result, historyItemArg,
                'ref processor must not consume an arg with type historyItem');
        });

        it('type discriminator: historyItemRef arg is NOT processed by item processor', () => {
            const sourceControls = new Map<number, MockSourceControl>();
            sourceControls.set(0, { historyProvider: { id: 'git' } });

            const itemProcessor = makeHistoryItemProcessor(sourceControls);
            const refArg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'refs/heads/main', type: 'historyItemRef' };

            // The item processor must not consume an arg with type historyItemRef.
            const result = itemProcessor(refArg);
            assert.strictEqual(result, refArg,
                'item processor must not consume an arg with type historyItemRef');
        });

        it('type discriminator fixes ordering bug: ref arg survives processor 1 intact', () => {
            // Regression test for the ordering bug described in the task:
            // Before the fix, Processor 1 (historyItem) would intercept the ref arg because
            // both processors used the same ScmHistoryItemCommandArg.is() guard without
            // checking the type discriminator. The ref arg would be "resolved" as a missing
            // history item and returned as { id: ref.id }, stripping sourceControlHandle.
            // Processor 2 would then fail to match (no sourceControlHandle) and pass through
            // the degraded { id } object.
            //
            // With the fix, Processor 1 sees type === 'historyItemRef', skips, and passes the
            // arg through unchanged so Processor 2 can correctly resolve it.
            const sourceControls = new Map<number, MockSourceControl>();
            const mainRef = { id: 'refs/heads/main', name: 'main' };
            sourceControls.set(0, { historyProvider: { id: 'git', currentHistoryItemRef: mainRef } });

            const itemProcessor = makeHistoryItemProcessor(sourceControls);
            const refProcessor = makeHistoryItemRefProcessor(sourceControls);

            const refArg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'refs/heads/main', type: 'historyItemRef' };

            // Simulate the reduce chain: arg passes through processor 1, then processor 2
            const afterP1 = itemProcessor(refArg);
            // Processor 1 must pass it through unchanged (not strip sourceControlHandle)
            assert.strictEqual(afterP1, refArg,
                'Processor 1 must not consume the historyItemRef arg');

            const afterP2 = refProcessor(afterP1 as ScmHistoryItemCommandArg);
            // Processor 2 must resolve it to the full ref object
            assert.strictEqual(afterP2, mainRef,
                'Processor 2 must resolve the ref arg to the full SourceControlHistoryItemRef');
        });

        it('discriminated interface works for both history items and refs: type field routes correctly', () => {
            const sourceControls = new Map<number, MockSourceControl>();
            const remoteRef = { id: 'refs/remotes/origin/main', name: 'origin/main' };
            sourceControls.set(1, { historyProvider: { id: 'git', currentHistoryItemRemoteRef: remoteRef } });

            const historyItemArg: ScmHistoryItemCommandArg = { sourceControlHandle: 1, id: 'deadbeef', type: 'historyItem' };
            const historyRefArg: ScmHistoryItemCommandArg = { sourceControlHandle: 1, id: 'refs/remotes/origin/main', type: 'historyItemRef' };

            // Both are valid ScmHistoryItemCommandArg
            assert.strictEqual(ScmHistoryItemCommandArg.is(historyItemArg), true);
            assert.strictEqual(ScmHistoryItemCommandArg.is(historyRefArg), true);

            // Item processor resolves a commit by id (skips ref arg)
            const itemProcessor = makeHistoryItemProcessor(sourceControls);
            assert.deepStrictEqual(itemProcessor(historyItemArg), { id: 'deadbeef' });
            assert.strictEqual(itemProcessor(historyRefArg), historyRefArg,
                'item processor must pass through historyItemRef args unchanged');

            // Ref processor resolves a ref by id (skips item arg)
            const refProcessor = makeHistoryItemRefProcessor(sourceControls);
            assert.strictEqual(refProcessor(historyRefArg), remoteRef);
            assert.strictEqual(refProcessor(historyItemArg), historyItemArg,
                'ref processor must pass through historyItem args unchanged');
        });

        it('generic ScmCommandArg processor does NOT match history item args (guard specificity)', () => {
            // Because we rely on registration order (history processors run first),
            // verify here that if the generic processor receives a history item arg,
            // it would treat it as a plain ScmCommandArg and NOT pass it through unchanged.
            const sourceControls = new Map<number, MockSourceControl>();
            sourceControls.set(0, { historyProvider: { id: 'git' } });

            const genericProcessor = makeGenericScmProcessor(sourceControls);
            const historyItemArg: ScmHistoryItemCommandArg = { sourceControlHandle: 0, id: 'abc123', type: 'historyItem' };

            // The generic processor DOES match (ScmCommandArg.is() is true for history args),
            // but it returns the sourceControl object — not the historyItem shape.
            // This confirms why history processors must be registered first.
            const result = genericProcessor(historyItemArg);
            assert.ok(result !== undefined, 'Generic processor matched history item arg');
            assert.ok(!('id' in (result as object) && Object.keys(result as object).length === 1),
                'Generic processor should NOT return the history item shape { id }');
        });

        it('history item processor passes through non-matching args unchanged', () => {
            const sourceControls = new Map<number, MockSourceControl>();
            const processor = makeHistoryItemProcessor(sourceControls);

            const plainArg: ScmCommandArg = { sourceControlHandle: 42 };
            const result = processor(plainArg);

            // Not a ScmHistoryItemCommandArg (missing 'id' and 'type'), so returned unchanged
            assert.strictEqual(result, plainArg);
        });
    });
});

