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
import { AISettingsService, ServerToolDescriptor } from '@theia/ai-core/lib/common';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AgentServerToolsSettings } from './agent-capabilities-settings';

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
