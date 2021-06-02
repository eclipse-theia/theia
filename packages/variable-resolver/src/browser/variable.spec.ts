/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as chai from 'chai';
import { Container, ContainerModule } from '@theia/core/shared/inversify';
import { ILogger, Disposable } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Variable, VariableRegistry } from './variable';

/* eslint-disable no-unused-expressions */

const expect = chai.expect;
let variableRegistry: VariableRegistry;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
});

describe('variable api', () => {
    let testContainer: Container;

    before(() => {
        testContainer = new Container();
        const module = new ContainerModule((bind, unbind, isBound, rebind) => {
            bind(ILogger).to(MockLogger);
            bind(VariableRegistry).toSelf();
        });
        testContainer.load(module);
    });

    beforeEach(() => {
        variableRegistry = testContainer.get<VariableRegistry>(VariableRegistry);
    });

    it('should register and return variable', () => {
        registerTestVariable();

        const variable = variableRegistry.getVariable(TEST_VARIABLE.name);
        expect(variable).is.not.undefined;
        if (variable) {
            expect(variable.name).is.equal(TEST_VARIABLE.name);
        }
    });

    it('should not register a variable for already existed name', () => {
        const variables: Variable[] = [
            {
                name: 'workspaceRoot',
                description: 'workspace root URI',
                resolve: () => Promise.resolve('')
            },
            {
                name: 'workspaceRoot',
                description: 'workspace root URI 2',
                resolve: () => Promise.resolve('')
            }
        ];
        variables.forEach(v => variableRegistry.registerVariable(v));

        const registeredVariables = variableRegistry.getVariables();
        expect(registeredVariables.length).to.be.equal(1);
        expect(registeredVariables[0].name).to.be.equal('workspaceRoot');
        expect(registeredVariables[0].description).to.be.equal('workspace root URI');
    });

    it('should dispose variable', () => {
        const disposable = registerTestVariable();
        disposable.dispose();

        const variable = variableRegistry.getVariable(TEST_VARIABLE.name);
        expect(variable).is.undefined;
    });

    it('should unregister variables on dispose', () => {
        registerTestVariable();

        let variables = variableRegistry.getVariables();
        expect(variables.length).to.be.equal(1);

        variableRegistry.dispose();

        variables = variableRegistry.getVariables();
        expect(variables.length).to.be.equal(0);
    });
});

const TEST_VARIABLE: Variable = {
    name: 'workspaceRoot',
    resolve: () => Promise.resolve('')
};

function registerTestVariable(): Disposable {
    return variableRegistry.registerVariable(TEST_VARIABLE);
}
