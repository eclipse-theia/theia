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

import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { MaybePromise } from '@theia/core/lib/common/types';
import { ContainerModule } from 'inversify';
import { TestCase } from './framework/test-case';
import { TestResultsPrinter } from './framework/test-results-printer';
import { TestRunner } from './framework/test-runner';
import { DebugTests } from './tests/debug-tests';
import { LanguagesTest } from './tests/languages-tests';

export default new ContainerModule(bind => {
    bind(TestResultsPrinter).toSelf().inRequestScope();
    bind(TestRunner).toSelf().inSingletonScope();
    bindContributionProvider(bind, TestCase);

    bind(FrontendApplicationContribution).toDynamicValue(ctx => ({
        async onStart(app: FrontendApplication): Promise<MaybePromise<void>> {
            const testRunner = ctx.container.get<TestRunner>(TestRunner);
            if (testRunner.isTestEnvironment()) {
                setTimeout(async () => {
                    await testRunner.run();
                    const results = testRunner.getResults();
                    const resultPrinter = ctx.container.get<TestResultsPrinter>(TestResultsPrinter);
                    resultPrinter.print(results);
                }, 20);
            }
        }
    }));

    bind(DebugTests).toSelf().inSingletonScope();
    bind(TestCase).toService(DebugTests);
    bind(LanguagesTest).toSelf().inSingletonScope();
    bind(TestCase).toService(LanguagesTest);
});
