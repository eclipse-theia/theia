/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { interfaces } from '@theia/core/shared/inversify';
import { TerminalTask, TaskFactory, TerminalTaskOptions } from './process-task';
import { TerminalTaskRunner } from './process-task-runner';
import { TerminalTaskRunnerContribution } from './process-task-runner-contribution';
import { TaskRunnerContribution } from '../task-runner';

export function bindProcessTaskRunnerModule(bind: interfaces.Bind): void {
    bind(TaskFactory).toFactory(ctx => (options: TerminalTaskOptions) => {
        const child = ctx.container.createChild();
        child.bind(TerminalTaskOptions).toConstantValue(options);
        return child.get(TerminalTask);
    });
    bind(TerminalTask).toSelf().inTransientScope();
    bind(TerminalTaskRunner).toSelf().inSingletonScope();
    bind(TerminalTaskRunnerContribution).toSelf().inSingletonScope();
    bind(TaskRunnerContribution).toService(TerminalTaskRunnerContribution);
}
