/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { Container, ContainerModule } from 'inversify';
import { ILogger, Disposable } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Variable, VariableRegistry } from './variable';

let variableRegistry: VariableRegistry;

describe('variable api', () => {
    let testContainer: Container;

    beforeAll(() => {
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
        expect(variable).toBeDefined();
        if (variable) {
            expect(variable.name).toEqual(TEST_VARIABLE.name);
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
        expect(registeredVariables.length).toEqual(1);
        expect(registeredVariables[0].name).toEqual('workspaceRoot');
        expect(registeredVariables[0].description).toEqual('workspace root URI');
    });

    it('should dispose variable', () => {
        const disposable = registerTestVariable();
        disposable.dispose();

        const variable = variableRegistry.getVariable(TEST_VARIABLE.name);
        expect(variable).toBeUndefined();
    });

    it('should unregister variables on dispose', () => {
        registerTestVariable();

        let variables = variableRegistry.getVariables();
        expect(variables.length).toEqual(1);

        variableRegistry.dispose();

        variables = variableRegistry.getVariables();
        expect(variables.length).toEqual(0);
    });
});

const TEST_VARIABLE: Variable = {
    name: 'workspaceRoot',
    resolve: () => Promise.resolve('')
};

function registerTestVariable(): Disposable {
    return variableRegistry.registerVariable(TEST_VARIABLE);
}
