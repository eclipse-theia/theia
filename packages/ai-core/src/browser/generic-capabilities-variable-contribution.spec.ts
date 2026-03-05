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

import 'reflect-metadata';

import { expect } from 'chai';
import { Container } from 'inversify';
import {
    GenericCapabilitiesVariableContribution,
    SELECTED_SKILLS_VARIABLE,
    SELECTED_FUNCTIONS_VARIABLE,
    SELECTED_VARIABLES_VARIABLE
} from './generic-capabilities-variable-contribution';
import { CapabilityAwareContext } from '../common/capability-utils';

disableJSDOM();

describe('GenericCapabilitiesVariableContribution', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());
    let contribution: GenericCapabilitiesVariableContribution;
    let container: Container;

    beforeEach(() => {
        container = new Container();
        container.bind<GenericCapabilitiesVariableContribution>(GenericCapabilitiesVariableContribution).toSelf().inSingletonScope();
        contribution = container.get<GenericCapabilitiesVariableContribution>(GenericCapabilitiesVariableContribution);
    });

    describe('canResolve', () => {
        it('returns 1 for selected_skills variable', () => {
            const result = contribution.canResolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                {}
            );
            expect(result).to.equal(1);
        });

        it('returns 1 for selected_functions variable', () => {
            const result = contribution.canResolve(
                { variable: SELECTED_FUNCTIONS_VARIABLE },
                {}
            );
            expect(result).to.equal(1);
        });

        it('returns 1 for selected_variables variable', () => {
            const result = contribution.canResolve(
                { variable: SELECTED_VARIABLES_VARIABLE },
                {}
            );
            expect(result).to.equal(1);
        });

        it('returns -1 for unknown variables', () => {
            const result = contribution.canResolve(
                { variable: { id: 'unknown', name: 'unknown', description: 'unknown' } },
                {}
            );
            expect(result).to.equal(-1);
        });
    });

    describe('resolve', () => {
        it('returns empty string when no selections exist', async () => {
            const context: CapabilityAwareContext = {};

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            expect(result?.value).to.equal('');
        });

        it('returns empty string when selections array is empty', async () => {
            const context: CapabilityAwareContext = {
                genericCapabilitySelections: {
                    skills: []
                }
            };

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            expect(result?.value).to.equal('');
        });

        it('returns empty string for skills when skillService is not available', async () => {
            const context: CapabilityAwareContext = {
                genericCapabilitySelections: {
                    skills: ['skill1', 'skill2']
                }
            };

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            // Without skillService, it returns empty
            expect(result?.value).to.equal('');
        });

        it('returns correct variable in result', async () => {
            const context: CapabilityAwareContext = {};

            const result = await contribution.resolve(
                { variable: SELECTED_SKILLS_VARIABLE },
                context
            );

            expect(result?.variable).to.deep.equal(SELECTED_SKILLS_VARIABLE);
        });
    });
});
