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

import { expect } from 'chai';
import { QuickInputService } from '@theia/core/lib/browser';
import { InputOptions } from '@theia/core/lib/common/quick-pick-service';
import URI from '@theia/core/lib/common/uri';
import { CommonVariableContribution } from './common-variable-contribution';
import { VariableRegistry } from './variable';

disableJSDOM();

describe('CommonVariableContribution', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('keeps task prompt string inputs open when focus is lost', async () => {
        const contribution = new CommonVariableContribution();
        let inputOptions: InputOptions | undefined;

        (contribution as unknown as { env: { getExecPath: () => Promise<string> } }).env = {
            getExecPath: async () => ''
        };
        (contribution as unknown as { preferences: { get: () => unknown } }).preferences = {
            get: () => ({
                inputs: [{
                    id: 'task-argument',
                    type: 'promptString',
                    description: 'Enter a task argument',
                    default: 'default-value'
                }]
            })
        };
        (contribution as unknown as { quickInputService: Pick<QuickInputService, 'input'> }).quickInputService = {
            input: async options => {
                inputOptions = options;
                return 'task-argument';
            }
        };

        const variables = new VariableRegistry();
        await contribution.registerVariables(variables);

        const input = variables.getVariable('input');
        const resolved = await input?.resolve(new URI('file:///workspace'), 'task-argument', 'tasks');

        expect(resolved).to.equal('task-argument');
        expect(inputOptions).to.deep.equal({
            prompt: 'Enter a task argument',
            value: 'default-value',
            ignoreFocusLost: true
        });
    });
});
