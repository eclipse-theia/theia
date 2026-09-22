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
import { AiConfigurationRenderContext, AiConfigurationTreeItem } from '../ai-configuration-category';
import { CollectionCategoryRenderer } from './collection-category-renderer';

disableJSDOM();

describe('CollectionCategoryRenderer', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    class TestCollection extends CollectionCategoryRenderer {
        constructor(protected readonly items: AiConfigurationTreeItem[]) {
            super();
        }
        protected get categoryId(): string {
            return 'agents';
        }
        getTreeChildren(): AiConfigurationTreeItem[] {
            return this.items;
        }
        protected renderItemSections(): React.ReactNode {
            return undefined;
        }
        protected override getEmptyMessage(): string {
            return 'No agents';
        }
    }

    function renderOverview(items: AiConfigurationTreeItem[]): { container: HTMLElement; warnings: string[]; dispose: () => void } {
        // React reports duplicate keys through console.error; capture it so the test can assert on it, and
        // capture console.warn too so the renderer's expected duplicate-id warning stays out of the output.
        const warnings: string[] = [];
        const originalError = console.error;
        const originalWarn = console.warn;
        console.error = (...args: unknown[]) => { warnings.push(String(args[0])); };
        console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const ctx: AiConfigurationRenderContext = { scope: 'user', navigate: () => { }, update: () => { } };
        try {
            flushSync(() => root.render(new TestCollection(items).renderOverview(ctx) as React.ReactElement));
        } finally {
            console.error = originalError;
            console.warn = originalWarn;
        }
        return { container, warnings, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    it('shows one row per id, dropping an entry that repeats one', () => {
        const { container, warnings, dispose } = renderOverview([
            { id: 'code-reviewer', label: 'Code Reviewer' },
            { id: 'code-reviewer', label: 'Code Reviewer (copy)' },
            { id: 'coder', label: 'Coder' }
        ]);
        try {
            const labels = Array.from(container.querySelectorAll('.ai-configuration-item-row-label')).map(label => label.textContent);
            // The first wins: a repeated id is not addressable, so showing it would be a row that opens another.
            expect(labels).to.deep.equal(['Code Reviewer', 'Coder']);
            // And no React duplicate-key warnings, which is what a rendered duplicate produced.
            expect(warnings.filter(warning => warning.includes('same key'))).to.be.empty;
        } finally {
            dispose();
        }
    });

    it('logs the dropped id once, however often the overview re-renders', () => {
        const items: AiConfigurationTreeItem[] = [
            { id: 'code-reviewer', label: 'Code Reviewer' },
            { id: 'code-reviewer', label: 'Code Reviewer (copy)' }
        ];
        const collection = new TestCollection(items);
        const ctx: AiConfigurationRenderContext = { scope: 'user', navigate: () => { }, update: () => { } };
        const logged: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => { logged.push(String(args[0])); };
        try {
            collection.renderOverview(ctx);
            collection.renderOverview(ctx);
        } finally {
            console.warn = originalWarn;
        }

        expect(logged).to.have.lengthOf(1);
        expect(logged[0]).to.include('code-reviewer').and.to.include('agents');
    });

    it('leaves items with unique ids untouched, reporting their own status', () => {
        const { container, dispose } = renderOverview([
            { id: 'coder', label: 'Coder', status: { kind: 'on', label: 'Enabled' } },
            { id: 'architect', label: 'Architect', status: { kind: 'off', label: 'Disabled' } }
        ]);
        try {
            const badges = Array.from(container.querySelectorAll('.ai-configuration-status-badge-label')).map(badge => badge.textContent);
            expect(badges).to.deep.equal(['Enabled', 'Disabled']);
        } finally {
            dispose();
        }
    });
});
