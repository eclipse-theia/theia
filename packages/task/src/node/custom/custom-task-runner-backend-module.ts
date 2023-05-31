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

import { interfaces, Container } from '@theia/core/shared/inversify';
import { CustomTask, TaskFactory, TaskCustomOptions } from './custom-task';
import { CustomTaskRunner } from './custom-task-runner';
import { CustomTaskRunnerContribution } from './custom-task-runner-contribution';
import { TaskRunnerContribution } from '../task-runner';

export function bindCustomTaskRunnerModule(bind: interfaces.Bind): void {

    bind(CustomTask).toSelf().inTransientScope();
    bind(TaskFactory).toFactory(ctx =>
        (options: TaskCustomOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(TaskCustomOptions).toConstantValue(options);
            return child.get(CustomTask);
        }
    );
    bind(CustomTaskRunner).toSelf().inSingletonScope();
    bind(CustomTaskRunnerContribution).toSelf().inSingletonScope();
    bind(TaskRunnerContribution).toService(CustomTaskRunnerContribution);
}
