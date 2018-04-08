/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { Container, ContainerModule } from 'inversify';
import { Variable, VariableRegistry } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { VariableResolverService } from './variable-resolver-service';

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
});

describe('variable-resolver-service', () => {

    let testContainer: Container;

    before(() => {
        testContainer = new Container();
        const module = new ContainerModule((bind, unbind, isBound, rebind) => {
            bind(ILogger).to(MockLogger);
            bind(VariableRegistry).toSelf().inSingletonScope();
            bind(VariableResolverService).toSelf();
        });
        testContainer.load(module);
    });

    let variableRegistry: VariableRegistry;
    let variableResolverService: VariableResolverService;

    beforeEach(() => {
        variableRegistry = testContainer.get(VariableRegistry);
        variableResolverService = testContainer.get(VariableResolverService);

        const variables: Variable[] = [
            {
                name: 'file',
                description: 'current file',
                resolve: () => Promise.resolve('package.json')
            },
            {
                name: 'lineNumber',
                description: 'current line number',
                resolve: () => Promise.resolve('6')
            }
        ];
        variables.forEach(v => variableRegistry.registerVariable(v));
    });

    it('should resolve known variables in a text', async () => {
        const resolved = await variableResolverService.resolve('file: ${file}; line: ${lineNumber}');
        expect(resolved).is.equal('file: package.json; line: 6');
    });

    it('should resolve known variables in a string array', async () => {
        const resolved = await variableResolverService.resolveArray(['file: ${file}', 'line: ${lineNumber}']);
        expect(resolved.length).to.be.equal(2);
        expect(resolved).to.contain('file: package.json');
        expect(resolved).to.contain('line: 6');
    });

    it('should skip unknown variables', async () => {
        const resolved = await variableResolverService.resolve('workspace: ${workspaceRoot}; file: ${file}; line: ${lineNumber}');
        expect(resolved).is.equal('workspace: ${workspaceRoot}; file: package.json; line: 6');
    });
});
