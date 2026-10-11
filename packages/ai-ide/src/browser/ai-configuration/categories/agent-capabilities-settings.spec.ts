// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { PreferenceUtils } from '@theia/core/lib/common/preferences/preference-provider';
import { Deferred } from '@theia/core/lib/common/promise-util';
import * as React from '@theia/core/shared/react';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { AISettingsService, GenericCapabilitySelections, ServerToolDescriptor } from '@theia/ai-core/lib/common';
import { HoverService } from '@theia/core/lib/browser';
import { AvailableGenericCapabilities } from '@theia/ai-chat-ui/lib/browser/generic-capabilities-service';
import * as GenericCapabilitiesTreeModule from '@theia/ai-chat-ui/lib/browser/generic-capabilities-tree';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AgentGenericCapabilitiesSettings, AgentServerToolsSettings } from './agent-capabilities-settings';

disableJSDOM();

describe('AgentServerToolsSettings', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const tools: ServerToolDescriptor[] = [
        { id: 'web_search', name: 'Web Search', description: 'Search the web' },
        { id: 'code_execution', name: 'Code Execution' }
    ];

    interface Rendered {
        container: HTMLElement;
        /** Every `updateAgentSettings` call the section made, in order. */
        updates: Array<Record<string, unknown>>;
        /** Reset callbacks the rows handed to their gear menus, in row order. */
        resets: Array<() => void>;
        dispose: () => void;
    }

    function render(savedSelections?: Record<string, string[]>): Rendered {
        const updates: Array<Record<string, unknown>> = [];
        const resets: Array<() => void> = [];
        const aiSettingsService = {
            updateAgentSettings: async (_agent: string, settings: Record<string, unknown>) => { updates.push(settings); }
        } as unknown as AISettingsService;
        const settingsRowService = {
            openResetMenu: (_gear: HTMLElement, reset: () => void) => { resets.push(reset); }
        } as unknown as AiSettingsRowService;
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(React.createElement(AgentServerToolsSettings, {
            agentId: 'coder',
            tools,
            vendor: 'anthropic',
            savedSelections,
            aiSettingsService,
            settingsRowService
        })));
        return { container, updates, resets, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    it('lists one toggle per tool the model offers, checked for the enabled ones', () => {
        const { container, dispose } = render({ anthropic: ['web_search'] });
        try {
            const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
            expect(checkboxes.map(checkbox => checkbox.checked)).to.deep.equal([true, false]);
            expect(container.textContent).to.include('Web Search');
            expect(container.textContent).to.include('Search the web');
        } finally {
            dispose();
        }
    });

    it('marks an enabled tool as modified, since nothing is enabled by default', () => {
        const { container, dispose } = render({ anthropic: ['web_search'] });
        try {
            const rows = Array.from(container.querySelectorAll('.ai-configuration-item-row'));
            expect(rows.map(row => row.classList.contains('modified'))).to.deep.equal([true, false]);
        } finally {
            dispose();
        }
    });

    it('stores the enabled ids under the model vendor when a tool is switched on', async () => {
        const { container, updates, dispose } = render();
        try {
            flushSync(() => container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0].click());
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(updates).to.deep.equal([{ serverToolSelections: { anthropic: ['web_search'] } }]);
        } finally {
            dispose();
        }
    });

    it('drops the vendor entry instead of storing an empty list when the last tool is switched off', async () => {
        const { container, updates, dispose } = render({ anthropic: ['web_search'] });
        try {
            flushSync(() => container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[0].click());
            await new Promise(resolve => setTimeout(resolve, 0));

            // The whole setting goes when no vendor has a selection left, so no stale keys accumulate.
            expect(updates).to.deep.equal([{ serverToolSelections: undefined }]);
        } finally {
            dispose();
        }
    });

    it('offers a reset on the section header only while something is enabled, and leaves other vendors alone', async () => {
        const nothingEnabled = render();
        try {
            expect(Boolean(nothingEnabled.container.querySelector('.ai-agent-section-header-action'))).to.equal(false);
        } finally {
            nothingEnabled.dispose();
        }

        const { container, updates, dispose } = render({ anthropic: ['web_search'], openai: ['code_execution'] });
        try {
            // On the header line, not in a row of its own above the list.
            const reset = container.querySelector<HTMLButtonElement>('.ai-agent-section-header .ai-agent-section-header-action');
            flushSync(() => reset!.click());
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(updates).to.deep.equal([{ serverToolSelections: { openai: ['code_execution'] } }]);
        } finally {
            dispose();
        }
    });

    it('gives an enabled tool the same gear reset as a capability row, which switches it off', async () => {
        const { container, updates, resets, dispose } = render({ anthropic: ['web_search'] });
        try {
            const gears = Array.from(container.querySelectorAll('.ai-configuration-item-row-actions'));
            // Only the enabled row deviates from the default, so only it offers a reset.
            expect(gears).to.have.lengthOf(1);

            const gear = container.querySelector<HTMLElement>('.ai-settings-row-gear');
            flushSync(() => gear!.click());
            expect(resets).to.have.lengthOf(1);
            resets[0]();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(updates).to.deep.equal([{ serverToolSelections: undefined }]);
        } finally {
            dispose();
        }
    });
});

describe('AgentGenericCapabilitiesSettings', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        // The tree's root tooltips read the application name; the config lives on the fresh window.
        FrontendApplicationConfigProvider.set({});
    });
    after(() => disableJSDOM());

    const available: AvailableGenericCapabilities = {
        skills: [{ id: 'skill-a', name: 'skill-a' }, { id: 'skill-b', name: 'skill-b' }],
        mcpFunctions: [],
        functions: [{ id: 'fn-used', name: 'fn-used' }, { id: 'fn-a', name: 'fn-a' }],
        promptFragments: [],
        agentDelegation: [],
        variables: []
    };

    interface Rendered {
        container: HTMLElement;
        updates: Array<Record<string, unknown>>;
        reload: (savedSelections: GenericCapabilitySelections | undefined) => void;
        setStored: (selections: GenericCapabilitySelections | undefined) => void;
        getStored: () => GenericCapabilitySelections | undefined;
        finishWrite: (index: number, success?: boolean) => Promise<void>;
        rejectWrite: (index: number, error: Error) => Promise<void>;
        deferRead: () => Deferred<GenericCapabilitySelections | undefined>;
        dispose: () => void;
    }

    function render(
        savedSelections: GenericCapabilitySelections | undefined,
        availableCapabilities: AvailableGenericCapabilities | undefined,
        deferWrites = false
    ): Rendered {
        const updates: Array<Record<string, unknown>> = [];
        let stored = savedSelections;
        const writes: Array<(result: boolean | Error) => void> = [];
        const reads: Array<Deferred<GenericCapabilitySelections | undefined>> = [];
        const aiSettingsService = {
            getAgentSettings: async (agentId: string) => {
                expect(agentId).to.equal('coder');
                const deferred = reads.shift();
                return { genericCapabilitySelections: deferred ? await deferred.promise : stored };
            },
            updateAgentSettings: async (_agent: string, settings: Record<string, unknown>) => {
                updates.push(settings);
                const next = settings.genericCapabilitySelections as GenericCapabilitySelections | undefined;
                // PreferenceServiceImpl skips a write if it equals the value currently stored, not a pending value.
                if (PreferenceUtils.deepEqual(stored, next)) {
                    return;
                }
                if (deferWrites) {
                    await new Promise<void>((resolve, reject) => writes.push(result => {
                        if (result instanceof Error) {
                            reject(result);
                            return;
                        }
                        if (result) {
                            stored = next;
                        }
                        // Like the production service, emit a reload even when a write fails, then resolve.
                        reload(stored ? { ...stored } : undefined);
                        resolve();
                    }));
                } else {
                    stored = next;
                }
            }
        } as unknown as AISettingsService;
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const reload = (saved: GenericCapabilitySelections | undefined): void => flushSync(() => root.render(React.createElement(AgentGenericCapabilitiesSettings, {
            agentId: 'coder',
            savedSelections: saved,
            availableCapabilities,
            usedCapabilities: { functions: ['fn-used'] },
            aiSettingsService,
            settingsRowService: { openResetMenu: () => { } } as unknown as AiSettingsRowService,
            hoverService: { requestHover: () => { } } as unknown as HoverService,
            onOpenPromptSnippet: () => { }
        })));
        reload(savedSelections);
        return {
            container, updates, reload,
            setStored: selections => { stored = selections; },
            getStored: () => stored,
            finishWrite: async (index, success = true) => {
                await Promise.resolve();
                writes[index](success);
            },
            rejectWrite: async (index, error) => {
                await Promise.resolve();
                writes[index](error);
            },
            deferRead: () => {
                const deferred = new Deferred<GenericCapabilitySelections | undefined>();
                reads.push(deferred);
                return deferred;
            },
            dispose: () => { flushSync(() => root.unmount()); container.remove(); }
        };
    }

    function openEditorAndExpand(container: HTMLElement, rootName: string): void {
        flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="Edit generic capabilities"]')!.click());
        const header = Array.from(container.querySelectorAll<HTMLElement>('.theia-GenericCapabilities-TreeNodeHeader'))
            .find(candidate => candidate.textContent === rootName);
        flushSync(() => header!.click());
    }

    function item(container: HTMLElement, name: string): HTMLElement {
        return Array.from(container.querySelectorAll<HTMLElement>('.theia-GenericCapabilities-TreeItem')).find(candidate => candidate.textContent === name)!;
    }

    it('offers no editor when there is nothing to choose from', () => {
        const { container, dispose } = render({ skills: ['skill-a'] }, undefined);
        try {
            expect(Boolean(container.querySelector('button[aria-label="Edit generic capabilities"]'))).to.equal(false);
            expect(container.textContent).to.include('skill-a');
        } finally {
            dispose();
        }
    });

    it('saves a selection made in the editor right away, keeping earlier edits', async () => {
        const { container, updates, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            flushSync(() => item(container, 'skill-b').click());
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(updates).to.deep.equal([
                { genericCapabilitySelections: { skills: ['skill-a'] } },
                { genericCapabilitySelections: { skills: ['skill-a', 'skill-b'] } }
            ]);
            // The summary row reflects the edit without waiting for the saved value to be reloaded.
            expect(container.querySelector('.ai-configuration-item-list')!.textContent).to.include('skill-a, skill-b');
        } finally {
            dispose();
        }
    });

    it('preserves newer edits when an intermediate save is reloaded', async () => {
        const { container, updates, reload, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            flushSync(() => item(container, 'skill-b').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            reload({ skills: ['skill-a'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            flushSync(() => item(container, 'skill-a').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates[2]).to.deep.equal({ genericCapabilitySelections: { skills: ['skill-b'] } });
        } finally {
            dispose();
        }
    });

    it('ignores reversed stale props after all writes settle', async () => {
        const { container, updates, reload, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            flushSync(() => item(container, 'skill-b').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            reload({ skills: ['skill-a', 'skill-b'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            reload({ skills: ['skill-a'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            flushSync(() => item(container, 'skill-a').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates[2]).to.deep.equal({ genericCapabilitySelections: { skills: ['skill-b'] } });
        } finally {
            dispose();
        }
    });

    it('preserves a local reset when an earlier selection is reloaded', async () => {
        const { container, updates, reload, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="Reset all generic capability selections"]')!.click());
            await new Promise(resolve => setTimeout(resolve, 0));
            reload({ skills: ['skill-a'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            flushSync(() => item(container, 'skill-b').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates[2]).to.deep.equal({ genericCapabilitySelections: { skills: ['skill-b'] } });
        } finally {
            dispose();
        }
    });

    it('starts queued writes in order and keeps optimistic edits until the queue drains', async () => {
        const { container, updates, finishWrite, getStored, dispose } = render(undefined, available, true);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            flushSync(() => item(container, 'skill-b').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates).to.have.lengthOf(1);
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            await finishWrite(0);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates).to.have.lengthOf(2);
            expect(getStored()).to.deep.equal({ skills: ['skill-a'] });
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            await finishWrite(1);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(getStored()).to.deep.equal({ skills: ['skill-a', 'skill-b'] });
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
        } finally {
            dispose();
        }
    });

    it('persists A after rapid A to AB to A edits despite equal-value write suppression', async () => {
        const { container, updates, finishWrite, getStored, dispose } = render({ skills: ['skill-a'] }, available, true);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-b').click());
            flushSync(() => item(container, 'skill-b').click());
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates).to.have.lengthOf(1);
            await finishWrite(0);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(getStored()).to.deep.equal({ skills: ['skill-a', 'skill-b'] });
            expect(updates).to.have.lengthOf(2);
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            await finishWrite(1);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(getStored()).to.deep.equal({ skills: ['skill-a'] });
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
        } finally {
            dispose();
        }
    });

    it('preserves a rejected save promise without poisoning later queued writes', async () => {
        let change!: GenericCapabilitiesTreeModule.GenericCapabilitiesTreeProps['onGenericCapabilityChange'];
        const tree = sinon.stub(GenericCapabilitiesTreeModule, 'GenericCapabilitiesTree').callsFake(props => {
            change = props.onGenericCapabilityChange;
            return React.createElement('div');
        });
        const { container, updates, rejectWrite, finishWrite, getStored, dispose } = render(undefined, available, true);
        try {
            flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="Edit generic capabilities"]')!.click());
            let failed!: Promise<void>;
            let queued!: Promise<void>;
            flushSync(() => {
                failed = change('skills', ['skill-a']) as unknown as Promise<void>;
                queued = change('skills', ['skill-a', 'skill-b']) as unknown as Promise<void>;
            });
            const failure = new Error('Write failed');
            const rejection = failed.then(() => expect.fail('Expected the save to reject'), error => expect(error).to.equal(failure));
            const queuedResult = queued.then(() => undefined, error => error);
            await rejectWrite(0, failure);
            await rejection;
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates).to.have.lengthOf(2);
            await finishWrite(1);
            expect(await queuedResult).to.equal(undefined);
            expect(getStored()).to.deep.equal({ skills: ['skill-a', 'skill-b'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(container.querySelector('.ai-configuration-item-list')!.textContent).to.include('skill-a, skill-b');
        } finally {
            dispose();
            tree.restore();
        }
    });

    it('rolls back a swallowed write failure after its change event and resolving promise', async () => {
        const { container, finishWrite, dispose } = render({ skills: ['skill-a'] }, available, true);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-b').click());
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            await finishWrite(0, false);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
        } finally {
            dispose();
        }
    });

    it('retains a successful first edit when the second write fails without rejecting', async () => {
        const { container, finishWrite, updates, dispose } = render(undefined, available, true);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            flushSync(() => item(container, 'skill-b').click());
            await finishWrite(0);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            await finishWrite(1, false);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            flushSync(() => item(container, 'skill-a').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates[2]).to.deep.equal({ genericCapabilitySelections: undefined });
            await finishWrite(2);
        } finally {
            dispose();
        }
    });

    it('adopts external changes and a reset equal to the original baseline', async () => {
        const { container, reload, setStored, dispose } = render({ skills: ['skill-a'] }, available);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-b').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            setStored({ skills: ['skill-b'] });
            reload({ skills: ['skill-b'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            setStored({ skills: ['skill-a'] });
            reload({ skills: ['skill-a'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            setStored(undefined);
            reload(undefined);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
        } finally {
            dispose();
        }
    });

    it('rereads an external reset even when the saved prop is still undefined', async () => {
        const { container, reload, setStored, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            setStored(undefined);
            reload(undefined);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
        } finally {
            dispose();
        }
    });

    it('adopts an external baseline-equivalent reset after a pending write fails', async () => {
        const { container, reload, setStored, finishWrite, dispose } = render(undefined, available, true);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            await finishWrite(0);
            await new Promise(resolve => setTimeout(resolve, 0));
            flushSync(() => item(container, 'skill-b').click());
            setStored(undefined);
            reload({});
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            await finishWrite(1, false);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
        } finally {
            dispose();
        }
    });

    it('discards a stale asynchronous read after a newer local edit', async () => {
        const { container, updates, reload, deferRead, dispose } = render({ skills: ['skill-a'] }, available);
        try {
            openEditorAndExpand(container, 'Skills');
            await new Promise(resolve => setTimeout(resolve, 0));
            const staleRead = deferRead();
            reload({ skills: ['skill-a'] });
            flushSync(() => item(container, 'skill-b').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            staleRead.resolve({ skills: ['skill-a'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            flushSync(() => item(container, 'skill-a').click());
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates[1]).to.deep.equal({ genericCapabilitySelections: { skills: ['skill-b'] } });
        } finally {
            dispose();
        }
    });

    it('discards a write-completion read if another edit starts before it resolves', async () => {
        const { container, finishWrite, deferRead, dispose } = render(undefined, available, true);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            const staleRead = deferRead();
            await finishWrite(0);
            await new Promise(resolve => setTimeout(resolve, 0));
            flushSync(() => item(container, 'skill-b').click());
            staleRead.resolve({ skills: ['skill-a'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
            await finishWrite(1);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
        } finally {
            dispose();
        }
    });

    it('discards an older read when a newer invalidation has already reconciled', async () => {
        const { container, reload, setStored, deferRead, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Skills');
            await new Promise(resolve => setTimeout(resolve, 0));
            const staleRead = deferRead();
            reload({ skills: ['skill-a'] });
            setStored({ skills: ['skill-b'] });
            reload({ skills: ['skill-b'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            staleRead.resolve({ skills: ['skill-a'] });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(item(container, 'skill-a').querySelector<HTMLInputElement>('input')!.checked).to.equal(false);
            expect(item(container, 'skill-b').querySelector<HTMLInputElement>('input')!.checked).to.equal(true);
        } finally {
            dispose();
        }
    });

    it('preserves edits to different types made in the same tick', async () => {
        const { container, updates, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Skills');
            const functions = Array.from(container.querySelectorAll<HTMLElement>('.theia-GenericCapabilities-TreeNodeHeader'))
                .find(candidate => candidate.textContent === 'Functions')!;
            flushSync(() => functions.click());
            flushSync(() => {
                item(container, 'skill-a').click();
                item(container, 'fn-a').click();
            });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(updates[1]).to.deep.equal({ genericCapabilitySelections: { skills: ['skill-a'], functions: ['fn-a'] } });
        } finally {
            dispose();
        }
    });

    it('drops the setting instead of storing empty lists when the last selection is removed', async () => {
        const { container, updates, dispose } = render({ skills: ['skill-a'] }, available);
        try {
            openEditorAndExpand(container, 'Skills');
            flushSync(() => item(container, 'skill-a').click());
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(updates).to.deep.equal([{ genericCapabilitySelections: undefined }]);
        } finally {
            dispose();
        }
    });

    it('shows what the prompt already uses as checked and locked', () => {
        const { container, updates, dispose } = render(undefined, available);
        try {
            openEditorAndExpand(container, 'Functions');
            const used = item(container, 'fn-used');
            const checkbox = used.querySelector<HTMLInputElement>('input[type=checkbox]')!;
            expect(checkbox.checked).to.equal(true);
            expect(checkbox.disabled).to.equal(true);

            flushSync(() => used.click());
            expect(updates).to.deep.equal([]);
        } finally {
            dispose();
        }
    });
});
