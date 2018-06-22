/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { ContainerModule, Container } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common/messaging";
import { Task, TaskFactory, TaskProcessOptions } from './task';
import { TaskClient, TaskServer, taskPath } from '../common/task-protocol';
import { TaskServerImpl } from './task-server';
import { TaskManager } from './task-manager';
import { TaskWatcher } from '../common/task-watcher';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { createCommonBindings } from '../common/task-common-module';

export default new ContainerModule(bind => {

    bind(TaskManager).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(TaskManager)).inSingletonScope();
    bind(TaskServer).to(TaskServerImpl).inSingletonScope();
    bind(Task).toSelf().inTransientScope();
    bind(TaskWatcher).toSelf().inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<TaskClient>(taskPath, client => {
            const taskServer = ctx.container.get<TaskServer>(TaskServer);
            taskServer.setClient(client);
            // when connection closes, cleanup that client of task-server
            client.onDidCloseConnection(() => {
                taskServer.disconnectClient(client);
            });
            return taskServer;
        })
    ).inSingletonScope();

    bind(TaskFactory).toFactory(ctx =>
        (options: TaskProcessOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(TaskProcessOptions).toConstantValue(options);
            return child.get(Task);
        }
    );

    createCommonBindings(bind);
});
