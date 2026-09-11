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
import { InputBox, QuickInputHideReason, QuickInputService } from '@theia/core/lib/browser';
import { isCancelled } from '@theia/core/lib/common/cancellation';
import { Emitter } from '@theia/core/lib/common/event';
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

    function createInputBox(): { inputBox: InputBox; accept: Emitter<void>; hide: Emitter<{ reason: QuickInputHideReason }> } {
        const accept = new Emitter<void>();
        const hide = new Emitter<{ reason: QuickInputHideReason }>();
        const inputBox = {
            onDidAccept: accept.event,
            onDidHide: hide.event,
            dispose: () => undefined,
            hide: () => undefined,
            show: () => undefined
        } as unknown as InputBox;
        return { inputBox, accept, hide };
    }

    it('keeps task prompt string inputs open when focus is lost', async () => {
        const contribution = new CommonVariableContribution();
        const { inputBox, accept } = createInputBox();

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
        (contribution as unknown as { quickInputService: Pick<QuickInputService, 'createInputBox'> }).quickInputService = {
            createInputBox: () => inputBox
        };

        const variables = new VariableRegistry();
        await contribution.registerVariables(variables);

        const input = variables.getVariable('input');
        const resolving = input?.resolve(new URI('file:///workspace'), 'task-argument', 'tasks');
        expect(inputBox.prompt).to.equal('Enter a task argument');
        expect(inputBox.value).to.equal('default-value');
        expect(inputBox.ignoreFocusOut).to.equal(true);
        inputBox.value = 'task-argument';
        accept.fire();
        const resolved = await resolving;

        expect(resolved).to.equal('task-argument');
    });

    it('cancels task prompt string inputs when dismissed', async () => {
        const contribution = new CommonVariableContribution();
        const { inputBox, hide } = createInputBox();

        (contribution as unknown as { env: { getExecPath: () => Promise<string> } }).env = {
            getExecPath: async () => ''
        };
        (contribution as unknown as { preferences: { get: () => unknown } }).preferences = {
            get: () => ({
                inputs: [{
                    id: 'task-argument',
                    type: 'promptString',
                    description: 'Enter a task argument'
                }]
            })
        };
        (contribution as unknown as { quickInputService: Pick<QuickInputService, 'createInputBox'> }).quickInputService = {
            createInputBox: () => inputBox
        };

        const variables = new VariableRegistry();
        await contribution.registerVariables(variables);

        let error: Error | undefined;
        try {
            const resolving = variables.getVariable('input')?.resolve(new URI('file:///workspace'), 'task-argument', 'tasks');
            hide.fire({ reason: QuickInputHideReason.Gesture });
            await resolving;
        } catch (e) {
            error = e as Error;
        }
        expect(isCancelled(error)).to.equal(true);
    });

    it('cancels task pick string inputs when dismissed', async () => {
        const contribution = new CommonVariableContribution();
        let pickOptions: { placeholder?: string; ignoreFocusOut?: boolean } | undefined;

        (contribution as unknown as { env: { getExecPath: () => Promise<string> } }).env = {
            getExecPath: async () => ''
        };
        (contribution as unknown as { preferences: { get: () => unknown } }).preferences = {
            get: () => ({
                inputs: [{
                    id: 'task-argument-choice',
                    type: 'pickString',
                    description: 'Choose a task argument',
                    options: ['first', 'second']
                }]
            })
        };
        (contribution as unknown as { quickInputService: Pick<QuickInputService, 'showQuickPick'> }).quickInputService = {
            showQuickPick: async (_items, options) => {
                pickOptions = options;
                return undefined;
            }
        };

        const variables = new VariableRegistry();
        await contribution.registerVariables(variables);

        let error: Error | undefined;
        try {
            await variables.getVariable('input')?.resolve(new URI('file:///workspace'), 'task-argument-choice', 'tasks');
        } catch (e) {
            error = e as Error;
        }
        expect(isCancelled(error)).to.equal(true);
        expect(pickOptions).to.deep.equal({
            placeholder: 'Choose a task argument',
            ignoreFocusOut: true
        });
    });
});
