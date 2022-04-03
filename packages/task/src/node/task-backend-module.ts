// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendAndFrontend, bindContributionProvider, ServiceContribution } from '@theia/core';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { bindProcessTaskRunnerModule } from './process/process-task-runner-backend-module';
import { bindCustomTaskRunnerModule } from './custom/custom-task-runner-backend-module';
import { TaskBackendApplicationContribution } from './task-backend-application-contribution';
import { TaskManager } from './task-manager';
import { TaskRunnerContribution, TaskRunnerRegistry } from './task-runner';
import { TaskServerImpl } from './task-server';
import { createCommonBindings } from '../common/task-common-module';
import { TaskServer, taskPath } from '../common';
import { ContainerScope } from '@theia/core/lib/common/container-scope';

export const TaskContainerModule = new ContainerModule(bind => {
    bind(TaskServerImpl).toSelf().inSingletonScope();
    bind(ContainerScope.Destroy).toService(TaskServerImpl);
    bind(TaskServer).toService(TaskServerImpl);
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [taskPath, () => ctx.container.get(TaskServer)]
        ))
        .inSingletonScope()
        .whenTargetNamed(BackendAndFrontend);
});

export default new ContainerModule(bind => {
    bind(ContainerModule)
        .toConstantValue(TaskContainerModule)
        .whenTargetNamed(BackendAndFrontend);

    bind(TaskManager).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TaskManager);

    createCommonBindings(bind);

    bind(TaskRunnerRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, TaskRunnerContribution);
    bind(TaskBackendApplicationContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TaskBackendApplicationContribution);

    bindProcessTaskRunnerModule(bind);
    bindCustomTaskRunnerModule(bind);
});
