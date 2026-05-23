// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { IShellTerminalServer, IShellTerminalServerOptions } from '@theia/terminal/lib/common/shell-terminal-protocol';
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

export default new ContainerModule((bind, _unbind, _isBound, _rebind, _unbindAsync, onActivation) => {
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

    // Inject the `qaap-task` helper env (PATH prefix, token, API URL) into every interactive
    // shell so users can call `qaap-task` from the Terminal tab — not just background-task
    // subprocesses, which already get it via QaapAgentTaskRunner.buildChildEnv.
    //
    // We patch the existing IShellTerminalServer instance rather than rebinding so the original
    // dispatching-client wiring (set up via a closure in @theia/terminal's onActivation) stays
    // intact.
    onActivation<IShellTerminalServer>(IShellTerminalServer, (ctx, server) => {
        const taskRunner = ctx.container.get(QaapAgentTaskRunner);
        const originalCreate = server.create.bind(server);
        server.create = async (options: IShellTerminalServerOptions) => {
            if (options.strictEnv !== true) {
                // Seed PATH from process.env so the helper-bin prefix builds on top of it.
                // mergeProcessEnv (called inside super.create) keeps options.env entries over
                // process.env, so anything we set here survives.
                const seeded: NodeJS.ProcessEnv = { PATH: process.env.PATH };
                for (const [key, value] of Object.entries(options.env ?? {})) {
                    if (value !== undefined && value !== null) {
                        seeded[key] = value;
                    }
                }
                if (taskRunner.applyHelperEnv(seeded)) {
                    options.env = {
                        ...(options.env ?? {}),
                        PATH: seeded.PATH ?? null,
                        QAAP_TASK_TOKEN: seeded.QAAP_TASK_TOKEN ?? null,
                        QAAP_TASK_API_URL: seeded.QAAP_TASK_API_URL ?? null,
                    };
                }
            }
            return originalCreate(options);
        };
        return server;
    });
});
