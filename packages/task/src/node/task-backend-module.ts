/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
