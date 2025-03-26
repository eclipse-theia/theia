// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import * as sinon from 'sinon';
import { ContributionProvider, Logger } from '@theia/core';
import { expect } from 'chai';
import {
    DefaultAIVariableService,
    AIVariable,
    AIVariableContribution,
    AIVariableResolverWithVariableDependencies,
    ResolvedAIVariable,
    createAIResolveVariableCache,
    AIVariableArg
} from './variable-service';

describe('DefaultAIVariableService', () => {
    let variableService: DefaultAIVariableService;
    let contributionProvider: sinon.SinonStubbedInstance<ContributionProvider<AIVariableContribution>>;
    let logger: sinon.SinonStubbedInstance<Logger>;

    const varA: AIVariable = {
        id: 'provider.a',
        name: 'a',
        description: 'Variable A'
    };

    const varB: AIVariable = {
        id: 'provider.b',
        name: 'b',
        description: 'Variable B'
    };

    const varC: AIVariable = {
        id: 'provider.c',
        name: 'c',
        description: 'Variable C'
    };

    const varD: AIVariable = {
        id: 'provider.d',
        name: 'd',
        description: 'Variable D'
    };

    // Create resolvers for our variables
    const resolverA: AIVariableResolverWithVariableDependencies = {
        canResolve: sinon.stub().returns(1),
        resolve: async (_request, _context, resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>) => {
            if (resolveDependency) {
                // Variable A depends on both B and C
                const dependencyB = await resolveDependency({ variable: varB });
                const dependencyC = await resolveDependency({ variable: varC });

                return {
                    variable: varA,
                    value: `A resolved with B: ${dependencyB?.value ?? 'undefined'} and C: ${dependencyC?.value ?? 'undefined'}`,
                    allResolvedDependencies: [
                        ...(dependencyB ? [dependencyB] : []),
                        ...(dependencyC ? [dependencyC] : [])
                    ]
                };
            }
            return { variable: varA, value: 'A value' };
        }
    };

    const resolverB: AIVariableResolverWithVariableDependencies = {
        canResolve: sinon.stub().returns(1),
        resolve: async (_request, _context, resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>) => {
            if (resolveDependency) {
                // Variable B depends on A, creating a cycle
                const dependencyA = await resolveDependency({ variable: varA });

                return {
                    variable: varB,
                    value: `B resolved with A: ${dependencyA?.value ?? 'undefined (cycle detected)'}`,
                    allResolvedDependencies: dependencyA ? [dependencyA] : []
                };
            }
            return { variable: varB, value: 'B value' };
        }
    };

    const resolverC: AIVariableResolverWithVariableDependencies = {
        canResolve: sinon.stub().returns(1),
        resolve: async (_request, _context, resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>) => {
            if (resolveDependency) {
                // Variable C depends on D with two different arguments
                const dependencyD1 = await resolveDependency({ variable: varD, arg: 'arg1' });
                const dependencyD2 = await resolveDependency({ variable: varD, arg: 'arg2' });

                return {
                    variable: varC,
                    value: `C resolved with D(arg1): ${dependencyD1?.value ?? 'undefined'} and D(arg2): ${dependencyD2?.value ?? 'undefined'}`,
                    allResolvedDependencies: [
                        ...(dependencyD1 ? [dependencyD1] : []),
                        ...(dependencyD2 ? [dependencyD2] : [])
                    ]
                };
            }
            return { variable: varC, value: 'C value' };
        }
    };

    const resolverD: AIVariableResolverWithVariableDependencies = {
        canResolve: sinon.stub().returns(1),
        resolve: async request => {
            const arg = request.arg;
            return {
                variable: varD,
                value: arg ? `D value with ${arg}` : 'D value'
            };
        }
    };

    beforeEach(() => {
        // Create stub for the contribution provider
        contributionProvider = {
            getContributions: sinon.stub().returns([])
        } as sinon.SinonStubbedInstance<ContributionProvider<AIVariableContribution>>;

        // Create stub for logger
        logger = sinon.createStubInstance(Logger);

        // Create the service under test
        variableService = new DefaultAIVariableService(
            contributionProvider,
            logger
        );

        // Register the variables and resolvers
        variableService.registerResolver(varA, resolverA);
        variableService.registerResolver(varB, resolverB);
        variableService.registerResolver(varC, resolverC);
        variableService.registerResolver(varD, resolverD);
    });

    describe('resolveVariable', () => {
        it('should handle recursive variable resolution and detect cycles', async () => {
            // Try to resolve variable A, which has a cycle with B and also depends on C which depends on D
            const result = await variableService.resolveVariable('a', {});

            // Verify the result
            expect(result).to.not.be.undefined;
            expect(result!.variable).to.deep.equal(varA);

            // The value should contain B's value (with a cycle detection) and C's value
            expect(result!.value).to.include('B resolved with A: undefined (cycle detected)');
            expect(result!.value).to.include('C resolved with D(arg1): D value with arg1 and D(arg2): D value with arg2');

            // Verify that we logged a warning about the cycle
            expect(logger.warn.calledOnce).to.be.true;
            expect(logger.warn.firstCall.args[0]).to.include('Cycle detected for variable: a');

            // Verify dependencies are tracked
            expect(result!.allResolvedDependencies).to.have.lengthOf(2);

            // Find the B dependency and verify it doesn't have A in its dependencies (due to cycle detection)
            const bDependency = result!.allResolvedDependencies!.find(d => d.variable.name === 'b');
            expect(bDependency).to.not.be.undefined;
            expect(bDependency!.allResolvedDependencies).to.be.empty;

            // Find the C dependency and its D dependencies
            const cDependency = result!.allResolvedDependencies!.find(d => d.variable.name === 'c');
            expect(cDependency).to.not.be.undefined;
            expect(cDependency!.value).to.equal('C resolved with D(arg1): D value with arg1 and D(arg2): D value with arg2');
            expect(cDependency!.allResolvedDependencies).to.have.lengthOf(2);

            const dDependency1 = cDependency!.allResolvedDependencies![0];
            expect(dDependency1.variable.name).to.equal('d');
            expect(dDependency1.value).to.equal('D value with arg1');

            const dDependency2 = cDependency!.allResolvedDependencies![1];
            expect(dDependency2.variable.name).to.equal('d');
            expect(dDependency2.value).to.equal('D value with arg2');
        });

        it('should handle variables with a simple chain of dependencies', async () => {
            // Variable C depends on D with two different arguments
            const result = await variableService.resolveVariable('c', {});

            expect(result).to.not.be.undefined;
            expect(result!.variable).to.deep.equal(varC);
            expect(result!.value).to.equal('C resolved with D(arg1): D value with arg1 and D(arg2): D value with arg2');

            // Verify dependency chain
            expect(result!.allResolvedDependencies).to.have.lengthOf(2);

            const dDependency1 = result!.allResolvedDependencies![0];
            expect(dDependency1.variable.name).to.equal('d');
            expect(dDependency1.value).to.equal('D value with arg1');

            const dDependency2 = result!.allResolvedDependencies![1];
            expect(dDependency2.variable.name).to.equal('d');
            expect(dDependency2.value).to.equal('D value with arg2');
        });

        it('should handle variables without dependencies', async () => {
            // D has no dependencies
            const result = await variableService.resolveVariable('d', {});

            expect(result).to.not.be.undefined;
            expect(result!.variable).to.deep.equal(varD);
            expect(result!.value).to.equal('D value');
            expect(result!.allResolvedDependencies).to.be.undefined;
        });

        it('should handle variables with arguments', async () => {
            // Test D with an argument
            const result = await variableService.resolveVariable({ variable: 'd', arg: 'test-arg' }, {}, undefined);

            expect(result).to.not.be.undefined;
            expect(result!.variable).to.deep.equal(varD);
            expect(result!.value).to.equal('D value with test-arg');
            expect(result!.allResolvedDependencies).to.be.undefined;
        });

        it('should return undefined for non-existent variables', async () => {
            const result = await variableService.resolveVariable('nonexistent', {});
            expect(result).to.be.undefined;
        });

        it('should properly populate cache when resolving variables with dependencies', async () => {
            // Create a cache to pass into the resolver
            const cache = createAIResolveVariableCache();

            // Resolve variable A, which depends on B and C, and C depends on D with two arguments
            const result = await variableService.resolveVariable('a', {}, cache);

            // Verify that the result is correct
            expect(result).to.not.be.undefined;
            expect(result!.variable).to.deep.equal(varA);

            // Verify that the cache has entries for all variables
            expect(cache.size).to.equal(5); // A, B, C, D(arg1), and D(arg2)

            // Verify that all variables have entries in the cache
            expect(cache.has('a:')).to.be.true; // 'a:' key format is variableName + separator + arg (empty in this case)
            expect(cache.has('b:')).to.be.true;
            expect(cache.has('c:')).to.be.true;
            expect(cache.has('d:arg1')).to.be.true;
            expect(cache.has('d:arg2')).to.be.true;

            // Verify that all promises in the cache are resolved
            for (const entry of cache.values()) {
                const resolvedVar = await entry.promise;
                expect(resolvedVar).to.not.be.undefined;
                expect(entry.inProgress).to.be.false;
            }

            // Check specific variable results from cache
            const aEntry = cache.get('a:');
            const aResult = await aEntry!.promise;
            expect(aResult!.variable.name).to.equal('a');

            const bEntry = cache.get('b:');
            const bResult = await bEntry!.promise;
            expect(bResult!.variable.name).to.equal('b');

            const cEntry = cache.get('c:');
            const cResult = await cEntry!.promise;
            expect(cResult!.variable.name).to.equal('c');

            const dEntry1 = cache.get('d:arg1');
            const dResult1 = await dEntry1!.promise;
            expect(dResult1!.variable.name).to.equal('d');
            expect(dResult1!.value).to.equal('D value with arg1');

            const dEntry2 = cache.get('d:arg2');
            const dResult2 = await dEntry2!.promise;
            expect(dResult2!.variable.name).to.equal('d');
            expect(dResult2!.value).to.equal('D value with arg2');
        });
    });
});
