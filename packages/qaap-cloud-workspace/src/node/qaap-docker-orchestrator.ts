// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FileUri } from '@theia/core/lib/node';
import * as crypto from 'crypto';
import * as path from 'path';
import * as Dockerode from 'dockerode';

const QAAP_CONTAINER_PREFIX = 'qaap-ws-';
const DEFAULT_IMAGE = process.env.QAAP_DOCKER_IMAGE?.trim() || 'node:20-bookworm';
const WORKSPACE_MOUNT = '/workspace';

export interface QaapDockerEnsureResult {
    readonly containerId: string;
    readonly containerName: string;
    readonly workspaceMount: string;
    readonly hostPath: string;
}

/** One Docker container per repo/workspace when `QAAP_CLOUD_MODE=docker`. */
@injectable()
export class QaapDockerOrchestrator {

    protected docker: Dockerode | undefined;

    isEnabled(): boolean {
        return (process.env.QAAP_CLOUD_MODE?.trim() || 'local') === 'docker';
    }

    protected async getDocker(): Promise<Dockerode> {
        if (!this.docker) {
            this.docker = new Dockerode({ socketPath: process.env.DOCKER_HOST || '/var/run/docker.sock' });
        }
        return this.docker;
    }

    async ensureContainer(repoKey: string, workspaceUri: string): Promise<QaapDockerEnsureResult> {
        const hostPath = this.hostPathFromUri(workspaceUri);
        const name = this.containerNameFor(repoKey);
        const docker = await this.getDocker();
        let container: Dockerode.Container;
        try {
            container = docker.getContainer(name);
            const info = await container.inspect();
            if (!info.State.Running) {
                await container.start();
            }
        } catch {
            container = await docker.createContainer({
                name,
                Image: DEFAULT_IMAGE,
                Tty: true,
                WorkingDir: WORKSPACE_MOUNT,
                Cmd: ['/bin/bash'],
                HostConfig: {
                    Binds: [`${hostPath}:${WORKSPACE_MOUNT}`],
                    AutoRemove: false,
                },
            });
            await container.start();
        }
        const inspect = await container.inspect();
        return {
            containerId: inspect.Id,
            containerName: name,
            workspaceMount: WORKSPACE_MOUNT,
            hostPath,
        };
    }

    async stopContainer(repoKey: string): Promise<void> {
        const docker = await this.getDocker();
        try {
            const container = docker.getContainer(this.containerNameFor(repoKey));
            await container.stop({ t: 10 });
        } catch {
            /* already stopped */
        }
    }

    protected containerNameFor(repoKey: string): string {
        const hash = crypto.createHash('sha256').update(repoKey).digest('hex').slice(0, 12);
        return `${QAAP_CONTAINER_PREFIX}${hash}`;
    }

    protected hostPathFromUri(workspaceUri: string): string {
        if (workspaceUri.startsWith('file://')) {
            return FileUri.fsPath(workspaceUri);
        }
        return path.resolve(workspaceUri);
    }
}
