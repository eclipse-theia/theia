// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import type {
    QaapCloudWorkspaceEnsureRequest,
    QaapCloudWorkspaceSummary,
} from '../common/qaap-cloud-api-types';
import { QaapCloudWorkspaceStore } from './qaap-cloud-workspace-store';
import { QaapDockerOrchestrator } from './qaap-docker-orchestrator';

@injectable()
export class QaapCloudOrchestrator {

    @inject(QaapCloudWorkspaceStore)
    protected readonly store: QaapCloudWorkspaceStore;

    @inject(QaapDockerOrchestrator)
    protected readonly docker: QaapDockerOrchestrator;

    async ensure(request: QaapCloudWorkspaceEnsureRequest): Promise<QaapCloudWorkspaceSummary> {
        if (!request.workspaceUri) {
            return this.store.ensure(request);
        }
        if (!this.docker.isEnabled()) {
            return this.store.ensure(request);
        }
        try {
            const dockerResult = await this.docker.ensureContainer(request.repoKey, request.workspaceUri);
            return this.store.ensureWithContainer(request, {
                containerRef: dockerResult.containerId,
                status: 'ready',
                provider: 'docker',
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return this.store.ensureWithContainer(request, {
                status: 'error',
                provider: 'docker',
                error: message,
            });
        }
    }
}
