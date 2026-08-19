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
import { LanguageModel } from '@theia/ai-core/lib/common/language-model';
import { LanguageModelAlias } from '@theia/ai-core/lib/common/language-model-alias';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { ModelAliasesConfigurationCategory } from './model-aliases-configuration-category';

disableJSDOM();

function alias(id: string, description = ''): LanguageModelAlias {
    return { id, description, defaultModelIds: [] } as unknown as LanguageModelAlias;
}

function readyModel(id: string): LanguageModel {
    return { id, status: { status: 'ready' } } as unknown as LanguageModel;
}

function unreadyModel(id: string): LanguageModel {
    return { id, status: { status: 'unavailable', message: 'nope' } } as unknown as LanguageModel;
}

function createCategory(aliases: LanguageModelAlias[], resolved: Map<string, LanguageModel | undefined>): ModelAliasesConfigurationCategory {
    const category = new ModelAliasesConfigurationCategory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).aliases = aliases;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).resolvedModelForAlias = resolved;
    return category;
}

describe('ModelAliasesConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the model-aliases collection metadata', () => {
        const category = createCategory([], new Map());
        expect(category.id).to.equal(AiConfigurationCategoryId.MODEL_ALIASES);
        expect(category.kind).to.equal('collection');
        expect(category.renderer).to.equal(category);
    });

    it('maps aliases to tree items with a resolved/warn/error status', () => {
        const aliases = [alias('default/code', 'Coding'), alias('default/chat'), alias('broken')];
        const resolved = new Map<string, LanguageModel | undefined>([
            ['default/code', readyModel('m1')],
            ['default/chat', unreadyModel('m2')],
            ['broken', undefined]
        ]);
        const children = createCategory(aliases, resolved).getTreeChildren();
        expect(children.map(c => c.id)).to.deep.equal(['default/code', 'default/chat', 'broken']);
        expect(children[0].status?.kind).to.equal('on');
        // A ready alias shows what it resolves to (the model), not a generic "Ready".
        expect(children[0].status?.label).to.equal('m1');
        expect(children[1].status?.kind).to.equal('warn');
        expect(children[2].status?.kind).to.equal('error');
    });

    it('indexes one search item per alias, navigating to the item', () => {
        const category = createCategory([alias('default/code', 'Coding alias')], new Map());
        const items = category.getSearchItems();
        expect(items).to.have.lengthOf(1);
        expect(items[0].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.MODEL_ALIASES, itemId: 'default/code' });
        expect(items[0].keywords).to.equal('Coding alias');
    });
});
