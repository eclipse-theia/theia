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
import * as React from '@theia/core/shared/react';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { AISettingsService, GenericCapabilitySelections, ServerToolDescriptor } from '@theia/ai-core/lib/common';
import { HoverService } from '@theia/core/lib/browser';
import { AvailableGenericCapabilities } from '@theia/ai-chat-ui/lib/browser/generic-capabilities-service';
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
        functions: [{ id: 'fn-used', name: 'fn-used' }],
        promptFragments: [],
        agentDelegation: [],
        variables: []
    };

    interface Rendered {
        container: HTMLElement;
        updates: Array<Record<string, unknown>>;
        dispose: () => void;
    }

    function render(savedSelections: GenericCapabilitySelections | undefined, availableCapabilities: AvailableGenericCapabilities | undefined): Rendered {
        const updates: Array<Record<string, unknown>> = [];
        const aiSettingsService = {
            updateAgentSettings: async (_agent: string, settings: Record<string, unknown>) => { updates.push(settings); }
        } as unknown as AISettingsService;
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(React.createElement(AgentGenericCapabilitiesSettings, {
            agentId: 'coder',
            savedSelections,
            availableCapabilities,
            usedCapabilities: { functions: ['fn-used'] },
            aiSettingsService,
            settingsRowService: { openResetMenu: () => { } } as unknown as AiSettingsRowService,
            hoverService: { requestHover: () => { } } as unknown as HoverService,
            onOpenPromptSnippet: () => { }
        })));
        return { container, updates, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
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
