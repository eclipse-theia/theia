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
import { FrontendApplicationContribution, KeybindingContribution } from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution, bindRootContributionProvider, nls } from '@theia/core/lib/common';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { QuickOpenTask, TaskTerminateQuickOpen, TaskRestartRunningQuickOpen, TaskRunningQuickOpen } from './quick-open-task.js';
import { TaskContribution, TaskProviderRegistry, TaskResolverRegistry } from './task-contribution.js';
import { TaskService } from './task-service.js';
import { TaskConfigurations } from './task-configurations.js';
import { ProvidedTaskConfigurations } from './provided-task-configurations.js';
import { TaskFrontendContribution } from './task-frontend-contribution.js';
import { createCommonBindings } from '../common/task-common-module.js';
import { TaskServer, taskPath } from '../common/task-protocol.js';
import { TaskWatcher } from '../common/task-watcher.js';
import { bindProcessTaskModule } from './process/process-task-frontend-module.js';
import { TaskSchemaUpdater } from './task-schema-updater.js';
import { TaskDefinitionRegistry } from './task-definition-registry.js';
import { ProblemMatcherRegistry } from './task-problem-matcher-registry.js';
import { ProblemPatternRegistry } from './task-problem-pattern-registry.js';
import { TaskConfigurationManager } from './task-configuration-manager.js';
import { bindTaskPreferences } from '../common/task-preferences.js';
import '../../src/browser/style/index.css';
import './tasks-monaco-contribution.js';
import { TaskNameResolver } from './task-name-resolver.js';
import { TaskSourceResolver } from './task-source-resolver.js';
import { TaskTemplateSelector } from './task-templates.js';
import { TaskTerminalWidgetManager } from './task-terminal-widget-manager.js';
import { JsonSchemaContribution } from '@theia/core/lib/browser/json-schema-store';
import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input/quick-access';
import { TaskContextKeyService } from './task-context-key-service.js';
import { WorkspaceRestrictionContribution, WorkspaceRestriction } from '@theia/workspace/lib/browser/workspace-trust-service';

export default new ContainerModule(bind => {
    bind(TaskFrontendContribution).toSelf().inSingletonScope();
    bind(TaskService).toSelf().inSingletonScope();

    for (const identifier of [FrontendApplicationContribution, CommandContribution, KeybindingContribution, MenuContribution, QuickAccessContribution]) {
        bind(identifier).toService(TaskFrontendContribution);
    }

    bind(QuickOpenTask).toSelf().inSingletonScope();
    bind(TaskRunningQuickOpen).toSelf().inSingletonScope();
    bind(TaskTerminateQuickOpen).toSelf().inSingletonScope();
    bind(TaskRestartRunningQuickOpen).toSelf().inSingletonScope();
    bind(TaskConfigurations).toSelf().inSingletonScope();
    bind(ProvidedTaskConfigurations).toSelf().inSingletonScope();
    bind(TaskConfigurationManager).toSelf().inSingletonScope();

    bind(TaskServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const taskWatcher = ctx.container.get(TaskWatcher);
        return connection.createProxy<TaskServer>(taskPath, taskWatcher.getTaskClient());
    }).inSingletonScope();

    bind(TaskDefinitionRegistry).toSelf().inSingletonScope();
    bind(ProblemMatcherRegistry).toSelf().inSingletonScope();
    bind(ProblemPatternRegistry).toSelf().inSingletonScope();

    createCommonBindings(bind);

    bind(TaskProviderRegistry).toSelf().inSingletonScope();
    bind(TaskResolverRegistry).toSelf().inSingletonScope();
    bindRootContributionProvider(bind, TaskContribution);
    bind(TaskSchemaUpdater).toSelf().inSingletonScope();
    bind(JsonSchemaContribution).toService(TaskSchemaUpdater);
    bind(TaskNameResolver).toSelf().inSingletonScope();
    bind(TaskSourceResolver).toSelf().inSingletonScope();
    bind(TaskTemplateSelector).toSelf().inSingletonScope();
    bind(TaskTerminalWidgetManager).toSelf().inSingletonScope();
    bind(TaskContextKeyService).toSelf().inSingletonScope();

    bindProcessTaskModule(bind);
    bindTaskPreferences(bind);

    bind(WorkspaceRestrictionContribution).toConstantValue({
        getRestrictions(): WorkspaceRestriction[] {
            return [{
                label: nls.localize('theia/task/taskRestricted', 'Task execution is disabled in Restricted Mode')
            }];
        }
    });
});
