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
import { createRoot } from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { ToolRequest } from '@theia/ai-core';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import {
    AiConfigurationCategoryId,
    AiConfigurationRenderContext,
    AiConfigurationTools
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { ToolsConfigurationCategory } from './tools-configuration-category';

disableJSDOM();

function createCategory(
    functions: Record<string, Partial<ToolRequest>>,
    modes: Record<string, ToolConfirmationMode>,
    defaultState: ToolConfirmationMode
): ToolsConfigurationCategory {
    const category = new ToolsConfigurationCategory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).toolInvocationRegistry = { getFunction: (name: string) => functions[name] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).toolConfirmationModes = modes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).defaultState = defaultState;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).toolNames = Object.keys(functions);
    // Enough of the settings-row service to both describe the default-mode row and render the page.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).settingsRowService = {
        describe: () => ({ label: 'Default Tool Confirmation Mode' }),
        inspect: () => ({ value: ToolConfirmationMode.CONFIRM, scopeValue: undefined, defaultValue: ToolConfirmationMode.CONFIRM, modified: false }),
        tags: () => [],
        controlFor: () => ({ type: 'string' }),
        renderMarkdown: (markdown: string) => {
            const element = document.createElement('span');
            element.textContent = markdown;
            return element;
        }
    };
    return category;
}

describe('ToolsConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the tools single-page metadata', () => {
        const category = createCategory({}, {}, ToolConfirmationMode.CONFIRM);
        expect(category.id).to.equal(AiConfigurationCategoryId.TOOLS);
        expect(category.kind).to.equal('single-page');
    });

    describe('getEffectiveState', () => {
        it('uses an explicit per-tool setting when present', () => {
            const category = createCategory({ a: {} }, { a: ToolConfirmationMode.DISABLED }, ToolConfirmationMode.CONFIRM);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((category as any).getEffectiveState('a')).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('falls back to the default when there is no explicit setting', () => {
            const category = createCategory({ a: {} }, {}, ToolConfirmationMode.ALWAYS_ALLOW);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((category as any).getEffectiveState('a')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('downgrades confirmAlwaysAllow tools to CONFIRM when the default is ALWAYS_ALLOW', () => {
            const category = createCategory({ a: { confirmAlwaysAllow: true } }, {}, ToolConfirmationMode.ALWAYS_ALLOW);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((category as any).getEffectiveState('a')).to.equal(ToolConfirmationMode.CONFIRM);
        });
    });

    it('anchors every tool row with the row id its search item and the cross-page links navigate to', () => {
        const category = createCategory({ a: {}, mcp_x_y: {} }, {}, ToolConfirmationMode.CONFIRM);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const ctx: AiConfigurationRenderContext = { scope: 'user', navigate: () => { }, update: () => { } };
        try {
            flushSync(() => root.render(category.renderPage(ctx)));
            const anchored = Array.from(container.querySelectorAll('[data-ai-config-row-id]'))
                .map(element => element.getAttribute('data-ai-config-row-id'));
            const indexed = category.getSearchItems()
                .map(item => item.target.highlight?.rowId)
                .filter((rowId): rowId is string => rowId !== undefined);

            // An indexed-but-unanchored row silently never scrolls or flashes when navigated to.
            expect(indexed).to.have.members(['tool:a', 'tool:mcp_x_y']);
            indexed.forEach(rowId => expect(anchored).to.include(rowId));
            // The same ids an agent's used-tools list and a server's tool list link to.
            expect(anchored).to.include(AiConfigurationTools.selectionFor('mcp_x_y').highlight!.rowId);
        } finally {
            flushSync(() => root.unmount());
            container.remove();
        }
    });

    it('indexes the default-mode setting plus one item per tool', () => {
        const category = createCategory({ a: {}, mcp_x: {} }, {}, ToolConfirmationMode.CONFIRM);
        const items = category.getSearchItems();
        expect(items).to.have.lengthOf(3);
        expect(items[0].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.TOOLS });
        expect(items.slice(1).map(i => i.label)).to.have.members(['a', 'mcp_x']);
    });
});
