// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { QaapAgentTaskEndpoint } from './qaap-agent-task-endpoint';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';
import { QaapCloudOrchestrator } from './qaap-cloud-orchestrator';
import { QaapCloudWorkspaceEndpoint } from './qaap-cloud-workspace-endpoint';
import { QaapCloudWorkspaceStore } from './qaap-cloud-workspace-store';
import { QaapDeployRunner } from './qaap-deploy-runner';
import { QaapDockerOrchestrator } from './qaap-docker-orchestrator';
import { QaapPreviewShareStore } from './qaap-preview-share-store';
import { QaapPushSubscriptionStore } from './qaap-push-subscription-store';
import { QaapTerminalSessionStore } from './qaap-terminal-session-store';
import { QaapPreviewShareProxyContribution } from './qaap-preview-share-proxy';
import { QaapWebPushService } from './qaap-web-push-service';

export default new ContainerModule(bind => {
    bind(QaapCloudWorkspaceStore).toSelf().inSingletonScope();
    bind(QaapDockerOrchestrator).toSelf().inSingletonScope();
    bind(QaapCloudOrchestrator).toSelf().inSingletonScope();
    bind(QaapDeployRunner).toSelf().inSingletonScope();
    bind(QaapPushSubscriptionStore).toSelf().inSingletonScope();
    bind(QaapWebPushService).toSelf().inSingletonScope();
    bind(QaapPreviewShareStore).toSelf().inSingletonScope();
    bind(QaapTerminalSessionStore).toSelf().inSingletonScope();
    bind(QaapPreviewShareProxyContribution).toSelf().inSingletonScope();
    bind(QaapCloudWorkspaceEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapCloudWorkspaceEndpoint);
    bind(BackendApplicationContribution).toService(QaapPreviewShareProxyContribution);
    bind(QaapAgentTaskRunner).toSelf().inSingletonScope();
    bind(QaapAgentTaskEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(QaapAgentTaskEndpoint);
});
