/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { inject, injectable, named } from 'inversify';
import { TestCase } from './test-case';
import { TestResult } from './test-result';

@injectable()
export class TestRunner {

    // tslint:disable-next-line: no-any
    private testCases: any[] = [];
    private testResults: TestResult[] = [];

    constructor(
        @inject(ContributionProvider) @named(TestCase)
        protected readonly contributionsProvider: ContributionProvider<TestCase>) {

        this.testCases.push(...contributionsProvider.getContributions());
    }

    async run(): Promise<void> {
        for (const testCase of this.testCases) {
            // TODO before class
            for (const testMethod of this.getAllTestsMethods(testCase)) {
                try {
                    // TODO before method
                    await testCase[testMethod]();
                    this.testResults.push(new TestResult(testCase.constructor.name, testMethod, true));
                } catch (error) {
                    this.testResults.push(new TestResult(testCase.constructor.name, testMethod, false, error));
                } finally {
                    // TODO after method
                }
            }
            // TODO after class
        }
    }

    getResults(): TestResult[] {
        return this.testResults;
    }

    isTestEnvironment(): boolean {
        return window.location.search !== '' && window.location.search.indexOf('runTests') > 0;
    }

    // tslint:disable-next-line: no-any
    private getAllTestsMethods(obj: any): string[] {
        const testMethods: string[] = [];

        do {
            testMethods.push(...Object
                .getOwnPropertyNames(obj)
                .filter(testMethod => testMethod.startsWith('test') && typeof obj[testMethod] === 'function'));
        } while (obj = Object.getPrototypeOf(obj));

        return testMethods;
    }
}
