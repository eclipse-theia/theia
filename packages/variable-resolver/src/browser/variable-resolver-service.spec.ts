// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as chai from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { cancelled } from '@theia/core/lib/common';
import { VariableRegistry } from './variable';
import { VariableResolverService } from './variable-resolver-service';

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
});

describe('variable-resolver-service', () => {

    let testContainer: Container;
    let variableRegistry: VariableRegistry;
    let variableResolverService: VariableResolverService;

    beforeEach(() => {
        testContainer = new Container();
        testContainer.bind(VariableRegistry).toSelf().inSingletonScope();
        testContainer.bind(VariableResolverService).toSelf().inSingletonScope();
        variableRegistry = testContainer.get(VariableRegistry);
        variableRegistry.registerVariable({
            name: 'file',
            description: 'current file',
            resolve: () => Promise.resolve('package.json')
        });
        variableRegistry.registerVariable({
            name: 'lineNumber',
            description: 'current line number',
            resolve: () => Promise.resolve('6')
        });
        variableResolverService = testContainer.get(VariableResolverService);
    });

    it('should resolve known variables in a text', async () => {
        const resolved = await variableResolverService.resolve('file: ${file}; line: ${lineNumber}');
        expect(resolved).is.equal('file: package.json; line: 6');
    });

    it('should resolve known variables in a string array', async () => {
        const resolved = await variableResolverService.resolveArray(['file: ${file}', 'line: ${lineNumber}']);
        expect(resolved!.length).to.be.equal(2);
        expect(resolved).to.contain('file: package.json');
        expect(resolved).to.contain('line: 6');
    });

    it('should skip unknown variables', async () => {
        const resolved = await variableResolverService.resolve('workspace: ${workspaceRoot}; file: ${file}; line: ${lineNumber}');
        expect(resolved).is.equal('workspace: ${workspaceRoot}; file: package.json; line: 6');
    });

    it('should return undefined when a variable throws with `cancelled()` while resolving', async () => {
        variableRegistry.registerVariable({
            name: 'command',
            resolve: (contextUri, commandId) => {
                if (commandId === 'testCommand') {
                    throw cancelled();
                }
            }
        });
        const resolved = await variableResolverService.resolve('workspace: ${command:testCommand}; file: ${file}; line: ${lineNumber}');
        expect(resolved).equal(undefined);
    });
});
