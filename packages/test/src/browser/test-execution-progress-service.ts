// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Widget } from '@theia/core/lib/browser';
import { TestResultViewContribution } from './view/test-result-view-contribution';
import { TestViewContribution } from './view/test-view-contribution';
import { TestPreferences } from './test-preferences';

export interface TestExecutionProgressService {
    onTestRunRequested(preserveFocus: boolean): Promise<void>;
}

export const TestExecutionProgressService = Symbol('TestExecutionProgressService');

@injectable()
export class DefaultTestExecutionProgressService implements TestExecutionProgressService {

    @inject(TestResultViewContribution)
    protected readonly testResultView: TestResultViewContribution;

    @inject(TestViewContribution)
    protected readonly testView: TestViewContribution;

    @inject(TestPreferences)
    protected readonly testPreferences: TestPreferences;

    async onTestRunRequested(preserveFocus: boolean): Promise<void> {
        if (!preserveFocus) {
            const openTesting = this.testPreferences['testing.openTesting'];
            if (openTesting === 'openOnTestStart') {
                this.openTestResultView();
            }
        }
    }

    async openTestResultView(): Promise<Widget> {
        return this.testResultView.openView({ activate: true });
    }
}
