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

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution, bindContributionProvider } from '@theia/core/lib/common';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { QuickOpenTask } from './quick-open-task';
import { TaskContribution, TaskProviderRegistry, TaskResolverRegistry } from './task-contribution';
import { TaskService } from './task-service';
import { TaskConfigurations } from './task-configurations';
import { TaskFrontendContribution } from './task-frontend-contribution';
import { createCommonBindings } from '../common/task-common-module';
import { TaskServer, taskPath } from '../common/task-protocol';
import { TaskWatcher } from '../common/task-watcher';
import { bindProcessTaskModule } from './process/process-task-frontend-module';

export default new ContainerModule(bind => {
    bind(TaskFrontendContribution).toSelf().inSingletonScope();
    bind(TaskService).toSelf().inSingletonScope();

    for (const identifier of [FrontendApplicationContribution, CommandContribution, MenuContribution]) {
        bind(identifier).toService(TaskFrontendContribution);
    }

    bind(QuickOpenTask).toSelf().inSingletonScope();
    bind(TaskConfigurations).toSelf().inSingletonScope();

    bind(TaskServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const taskWatcher = ctx.container.get(TaskWatcher);
        return connection.createProxy<TaskServer>(taskPath, taskWatcher.getTaskClient());
    }).inSingletonScope();

    createCommonBindings(bind);

    bind(TaskProviderRegistry).toSelf().inSingletonScope();
    bind(TaskResolverRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, TaskContribution);

    bindProcessTaskModule(bind);
});
