// *****************************************************************************
// Copyright (C) 2021 ByteDance and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { CustomTaskRunner } from './custom-task-runner';
import { TaskRunnerContribution, TaskRunnerRegistry } from '../task-runner';

@injectable()
export class CustomTaskRunnerContribution implements TaskRunnerContribution {

    @inject(CustomTaskRunner)
    protected readonly customTaskRunner: CustomTaskRunner;

    registerRunner(runners: TaskRunnerRegistry): void {
        runners.registerRunner('customExecution', this.customTaskRunner);
    }
}
