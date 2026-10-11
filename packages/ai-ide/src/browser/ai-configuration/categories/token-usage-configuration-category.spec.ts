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
import { ModelTokenUsageData } from '@theia/ai-core/lib/browser/token-usage-frontend-service';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { TokenUsageConfigurationCategory } from './token-usage-configuration-category';

disableJSDOM();

describe('TokenUsageConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the token-usage single-page metadata and a page-level search item', () => {
        const category = new TokenUsageConfigurationCategory();
        expect(category.id).to.equal(AiConfigurationCategoryId.TOKEN_USAGE);
        expect(category.kind).to.equal('single-page');
        const items = category.getSearchItems();
        expect(items).to.have.lengthOf(1);
        expect(items[0].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.TOKEN_USAGE });
    });

    it('shows cache columns only when at least one model reports cache data', () => {
        const category = new TokenUsageConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const withoutCache: ModelTokenUsageData[] = [{ modelId: 'm', inputTokens: 1, outputTokens: 2 } as any];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).items = withoutCache;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((category as any).hasCacheData()).to.equal(false);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).items = [{ modelId: 'm', inputTokens: 1, outputTokens: 2, cachedInputTokens: 3 } as any];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((category as any).hasCacheData()).to.equal(true);
    });
});
