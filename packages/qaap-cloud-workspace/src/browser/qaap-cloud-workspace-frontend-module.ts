// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/qaap-cloud.css';
import '../../src/browser/style/qaap-agent-tasks.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WidgetFactory } from '@theia/core/lib/browser/widget-manager';
import { bindToolProvider } from '@theia/ai-core/lib/common/tool-invocation-registry';
import { QaapAgentTasksContribution } from './qaap-agent-tasks-contribution';
import { QaapAgentTasksWidget } from './qaap-agent-tasks-widget';
import { QaapCloudBootstrapUiContribution } from './qaap-cloud-bootstrap-ui-contribution';
import { QaapDeployCloudflareTool, QaapDeployVercelTool } from './qaap-deploy-tool-providers';
import { QaapTerminalPersistenceContribution } from './qaap-terminal-persistence-contribution';
import { QaapWebPushContribution } from './qaap-web-push-contribution';

export default new ContainerModule(bind => {
    bind(QaapCloudBootstrapUiContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapCloudBootstrapUiContribution);
    bind(CommandContribution).toService(QaapCloudBootstrapUiContribution);

    bind(QaapTerminalPersistenceContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapTerminalPersistenceContribution);

    bind(QaapWebPushContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapWebPushContribution);

    bind(QaapAgentTasksWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: QaapAgentTasksWidget.ID,
        createWidget: () => ctx.container.get(QaapAgentTasksWidget),
    })).inSingletonScope();
    bind(QaapAgentTasksContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(QaapAgentTasksContribution);

    bindToolProvider(QaapDeployVercelTool, bind);
    bindToolProvider(QaapDeployCloudflareTool, bind);
});
