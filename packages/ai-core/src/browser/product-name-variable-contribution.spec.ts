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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({ applicationName: 'Test IDE' });

import 'reflect-metadata';

import { expect } from 'chai';
import { ProductNameVariableContribution, PRODUCT_NAME_VARIABLE } from './product-name-variable-contribution';

disableJSDOM();

describe('ProductNameVariableContribution', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({ applicationName: 'Test IDE' });
    });
    after(() => disableJSDOM());

    let contribution: ProductNameVariableContribution;

    beforeEach(() => {
        contribution = new ProductNameVariableContribution();
    });

    it('should resolve to the configured application name', async () => {
        const result = await contribution.resolve(
            { variable: PRODUCT_NAME_VARIABLE },
            {}
        );
        expect(result).to.not.be.undefined;
        expect(result!.value).to.equal('Test IDE');
    });

    it('should return undefined for unknown variables', async () => {
        const result = await contribution.resolve(
            { variable: { id: 'other', name: 'other', description: 'other' } },
            {}
        );
        expect(result).to.be.undefined;
    });

    it('should return a positive priority from canResolve', async () => {
        const priority = await contribution.canResolve(
            { variable: PRODUCT_NAME_VARIABLE },
            {}
        );
        expect(priority).to.equal(1);
    });
});
