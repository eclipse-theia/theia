/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { TaskFrontendContribution } from './task-frontend-contribution';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { TaskServer, taskPath } from '../common/task-protocol';
import { TaskWatcher } from '../common/task-watcher';
import { TaskService } from './task-service';
import { QuickOpenTask } from './quick-open-task';
import { TaskConfigurations } from './task-configurations';
import { createCommonBindings } from '../common/task-common-module';

export default new ContainerModule(bind => {
    bind(TaskFrontendContribution).toSelf().inSingletonScope();
    bind(TaskService).toSelf().inSingletonScope();
    bind(CommandContribution).to(TaskFrontendContribution).inSingletonScope();
    bind(MenuContribution).to(TaskFrontendContribution).inSingletonScope();
    bind(TaskWatcher).toSelf().inSingletonScope();
    bind(QuickOpenTask).toSelf().inSingletonScope();
    bind(TaskConfigurations).toSelf().inSingletonScope();

    bind(TaskServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const taskWatcher = ctx.container.get(TaskWatcher);
        return connection.createProxy<TaskServer>(taskPath, taskWatcher.getTaskClient());
    }).inSingletonScope();

    createCommonBindings(bind);
});
