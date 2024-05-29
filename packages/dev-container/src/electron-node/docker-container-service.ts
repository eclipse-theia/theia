// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

import { ContributionProvider, MaybePromise, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import * as fs from '@theia/core/shared/fs-extra';
import * as Docker from 'dockerode';
import { LastContainerInfo } from '../electron-common/remote-container-connection-provider';
import { DevContainerConfiguration } from './devcontainer-file';
import { DevContainerFileService } from './dev-container-file-service';
import { ContainerOutputProvider } from '../electron-common/container-output-provider';
import { RemoteDockerContainerConnection } from './remote-container-connection-provider';

export const ContainerCreationContribution = Symbol('ContainerCreationContributions');

export interface ContainerCreationContribution {
    handleContainerCreation?(createOptions: Docker.ContainerCreateOptions,
        containerConfig: DevContainerConfiguration,
        api: Docker,
        outputProvider?: ContainerOutputProvider): MaybePromise<void>;

    /**
     * executed after creating and starting the container
     */
    handlePostCreate?(containerConfig: DevContainerConfiguration,
        container: Docker.Container,
        api: Docker,
        outputProvider?: ContainerOutputProvider): MaybePromise<void>;

    /**
     * executed after a connection has been established with the container and theia has been setup
     */
    handlePostConnect?(containerConfig: DevContainerConfiguration, connection: RemoteDockerContainerConnection,
        outputProvider?: ContainerOutputProvider): MaybePromise<void>;
}

@injectable()
export class DockerContainerService {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    @inject(ContributionProvider) @named(ContainerCreationContribution)
    protected readonly containerCreationContributions: ContributionProvider<ContainerCreationContribution>;

    @inject(DevContainerFileService)
    protected readonly devContainerFileService: DevContainerFileService;

    async getOrCreateContainer(docker: Docker, devcontainerFile: string,
        lastContainerInfo?: LastContainerInfo, outputProvider?: ContainerOutputProvider): Promise<Docker.Container> {
        let container;

        const workspace = new URI(await this.workspaceServer.getMostRecentlyUsedWorkspace());

        if (lastContainerInfo && fs.statSync(devcontainerFile).mtimeMs < lastContainerInfo.lastUsed) {
            try {
                container = docker.getContainer(lastContainerInfo.id);
                if ((await container.inspect()).State.Running) {
                    await container.restart();
                } else {
                    await container.start();
                }
            } catch (e) {
                container = undefined;
                console.warn('DevContainer: could not find last used container');
            }
        }
        if (!container) {
            container = await this.buildContainer(docker, devcontainerFile, workspace, outputProvider);
        }
        return container;
    }

    async postConnect(devcontainerFile: string, connection: RemoteDockerContainerConnection, outputProvider?: ContainerOutputProvider): Promise<void> {
        const devcontainerConfig = await this.devContainerFileService.getConfiguration(devcontainerFile);

        for (const containerCreateContrib of this.containerCreationContributions.getContributions()) {
            await containerCreateContrib.handlePostConnect?.(devcontainerConfig, connection, outputProvider);
        }

    }

    protected async buildContainer(docker: Docker, devcontainerFile: string, workspace: URI, outputProvider?: ContainerOutputProvider): Promise<Docker.Container> {
        const devcontainerConfig = await this.devContainerFileService.getConfiguration(devcontainerFile);

        if (!devcontainerConfig) {
            // TODO add ability for user to create new config
            throw new Error('No devcontainer.json');
        }

        const containerCreateOptions: Docker.ContainerCreateOptions = {
            Tty: true,
            ExposedPorts: {},
            HostConfig: {
                PortBindings: {},
                Mounts: [{
                    Source: workspace.path.toString(),
                    Target: `/workspaces/${workspace.path.name}`,
                    Type: 'bind'
                }],
            },
        };

        for (const containerCreateContrib of this.containerCreationContributions.getContributions()) {
            await containerCreateContrib.handleContainerCreation?.(containerCreateOptions, devcontainerConfig, docker, outputProvider);
        }

        // TODO add more config
        const container = await docker.createContainer(containerCreateOptions);
        await container.start();

        for (const containerCreateContrib of this.containerCreationContributions.getContributions()) {
            await containerCreateContrib.handlePostCreate?.(devcontainerConfig, container, docker, outputProvider);
        }

        return container;
    }
}
