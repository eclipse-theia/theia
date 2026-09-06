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
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { NO_OPEN_EDITORS_VALUE, OPEN_EDITORS_SHORT_VARIABLE, OPEN_EDITORS_VARIABLE, OpenEditorsVariableContribution } from './open-editors-variable-contribution';

disableJSDOM();

describe('OpenEditorsVariableContribution', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({});
    });
    after(() => disableJSDOM());

    /** A contribution that sees the given rendered list of open files. */
    function contribution(openFiles: string): OpenEditorsVariableContribution {
        const instance = new OpenEditorsVariableContribution();
        Object.assign(instance, { getAllOpenFilesRelative: () => openFiles });
        return instance;
    }

    it('resolves to the list of open files', async () => {
        const result = await contribution("'src/a.ts', 'src/b.ts'").resolve({ variable: OPEN_EDITORS_VARIABLE }, {});
        expect(result?.value).to.equal("'src/a.ts', 'src/b.ts'");
    });

    it('resolves to an explicit marker when no editor is open, for both variable names', async () => {
        for (const variable of [OPEN_EDITORS_VARIABLE, OPEN_EDITORS_SHORT_VARIABLE]) {
            const result = await contribution('').resolve({ variable }, {});
            expect(result?.value, variable.name).to.equal(NO_OPEN_EDITORS_VALUE);
        }
    });

    it('resolves nothing for other variables', async () => {
        const result = await contribution("'src/a.ts'").resolve({ variable: { id: 'other', name: 'other', description: '' } }, {});
        expect(result).to.be.undefined;
    });
});
