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
import { ILogger } from '@theia/core/lib/common/logger';
import { inject, injectable } from 'inversify';
import { TestResult } from './test-result';

@injectable()
export class TestResultsPrinter {
    @inject(ILogger) readonly logger: ILogger;

    print(results: TestResult[]): void {
        const passed = results.filter(result => result.isPassed);
        const failed = results.filter(result => !result.isPassed);

        this.logger.info('-------------------------------------------------------------');
        this.logger.info('Results:');
        this.logger.info('Test run:', results.length, 'Passed:', passed.length, 'Failures:', failed.length);
        for (const failure of failed) {
            this.logger.info(failure.testClass + '.' + failure.testMethod);
            this.logger.error(failure.error);
        }
        this.logger.info('-------------------------------------------------------------');
    }
}
