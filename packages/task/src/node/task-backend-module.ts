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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { bindRootContributionProvider } from '@theia/core';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { bindProcessTaskRunnerModule } from './process/process-task-runner-backend-module.js';
import { bindCustomTaskRunnerModule } from './custom/custom-task-runner-backend-module.js';
import { TaskBackendApplicationContribution } from './task-backend-application-contribution.js';
import { TaskManager } from './task-manager.js';
import { TaskRunnerContribution, TaskRunnerRegistry } from './task-runner.js';
import { TaskServerImpl } from './task-server.js';
import { createCommonBindings } from '../common/task-common-module.js';
import { TaskClient, TaskServer, taskPath } from '../common/index.js';
import { bindTaskPreferences } from '../common/task-preferences.js';

export default new ContainerModule(bind => {

    bind(TaskManager).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TaskManager);

    bind(TaskServer).to(TaskServerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<TaskClient>(taskPath, client => {
            const taskServer = ctx.container.get<TaskServer>(TaskServer);
            taskServer.setClient(client);
            // when connection closes, cleanup that client of task-server
            client.onDidCloseConnection(() => {
                taskServer.disconnectClient(client);
            });
            return taskServer;
        })
    ).inSingletonScope();

    createCommonBindings(bind);

    bind(TaskRunnerRegistry).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, TaskRunnerContribution);
    bind(TaskBackendApplicationContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(TaskBackendApplicationContribution);

    bindProcessTaskRunnerModule(bind);
    bindCustomTaskRunnerModule(bind);
    bindTaskPreferences(bind);
});
