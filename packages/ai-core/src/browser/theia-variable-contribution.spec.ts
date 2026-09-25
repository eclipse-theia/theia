// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import { TheiaVariableContribution } from './theia-variable-contribution';

disableJSDOM();

describe('TheiaVariableContribution', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({ applicationName: 'Test IDE' });
    });
    after(() => disableJSDOM());

    const relativeFile = { id: 'theia-relativeFile', name: 'currentRelativeFilePath', description: '' };

    /** A contribution whose variable resolver returns `value` for every reference, or leaves the reference verbatim when `value` is undefined. */
    function contribution(value: string | undefined): TheiaVariableContribution {
        const instance = new TheiaVariableContribution();
        Object.assign(instance, {
            variableResolverService: {
                resolve: async (text: string) => value === undefined ? text : value
            }
        });
        return instance;
    }

    it('resolves to the value of the underlying Theia variable', async () => {
        const result = await contribution('src/index.ts').resolve({ variable: relativeFile }, {});
        expect(result).to.deep.equal({ value: 'src/index.ts', variable: relativeFile });
    });

    it('resolves to an empty value when the Theia variable has no value and the reference is left verbatim (no active editor)', async () => {
        const result = await contribution(undefined).resolve({ variable: relativeFile }, {});
        expect(result).to.deep.equal({ value: '', variable: relativeFile });
    });

    it('resolves a reference with an argument to an empty value when it is left verbatim', async () => {
        const result = await contribution(undefined).resolve({ variable: { id: 'theia-file', name: 'currentAbsoluteFilePath', description: '' }, arg: 'x' }, {});
        expect(result?.value).to.equal('');
    });

    it('resolves to nothing when the variable resolver returns nothing', async () => {
        const instance = new TheiaVariableContribution();
        Object.assign(instance, { variableResolverService: { resolve: async () => undefined } });
        expect(await instance.resolve({ variable: relativeFile }, {})).to.be.undefined;
    });
});
