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

import { ContributionProvider, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { parse } from 'jsonc-parser';
import * as fs from '@theia/core/shared/fs-extra';
import * as Docker from 'dockerode';
import { LastContainerInfo } from '../electron-common/remote-container-connection-provider';
import { DevContainerConfiguration } from './devcontainer-file';

export const ContainerCreationContribution = Symbol('ContainerCreationContributions');

export interface ContainerCreationContribution {
    handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration, api: Docker): Promise<void>;
}

@injectable()
export class DockerContainerService {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    @inject(ContributionProvider) @named(ContainerCreationContribution)
    protected readonly containerCreationContributions: ContributionProvider<ContainerCreationContribution>;

    async getOrCreateContainer(docker: Docker, lastContainerInfo?: LastContainerInfo): Promise<[Docker.Container, number]> {
        let port = Math.floor(Math.random() * (49151 - 10000)) + 10000;
        let container;

        const workspace = new URI(await this.workspaceServer.getMostRecentlyUsedWorkspace());
        if (!workspace) {
            throw new Error('No workspace');
        }

        const devcontainerFile = workspace.resolve('.devcontainer/devcontainer.json');

        if (lastContainerInfo && fs.statSync(devcontainerFile.path.fsPath()).mtimeMs < lastContainerInfo.lastUsed) {
            try {
                container = docker.getContainer(lastContainerInfo.id);
                if ((await container.inspect()).State.Running) {
                    await container.restart();
                } else {
                    await container.start();
                }
                port = lastContainerInfo.port;
            } catch (e) {
                container = undefined;
                console.warn('DevContainer: could not find last used container');
            }
        }
        if (!container) {
            container = await this.buildContainer(docker, port, devcontainerFile, workspace);
        }
        return [container, port];
    }

    protected async buildContainer(docker: Docker, port: number, devcontainerFile: URI, workspace: URI): Promise<Docker.Container> {
        const devcontainerConfig = parse(await fs.readFile(devcontainerFile.path.fsPath(), 'utf-8').catch(() => '0')) as DevContainerConfiguration;
        devcontainerConfig.location = devcontainerFile.path.dir.fsPath();

        if (!devcontainerConfig) {
            // TODO add ability for user to create new config
            throw new Error('No devcontainer.json');
        }

        const containerCreateOptions: Docker.ContainerCreateOptions = {
            Tty: true,
            ExposedPorts: {
                [`${port}/tcp`]: {},
            },
            HostConfig: {
                PortBindings: {
                    [`${port}/tcp`]: [{ HostPort: '0' }],
                },
                Mounts: [{
                    Source: workspace.path.toString(),
                    Target: `/workspaces/${workspace.path.name}`,
                    Type: 'bind'
                }],
            },
        };

        for (const containerCreateContrib of this.containerCreationContributions.getContributions()) {
            await containerCreateContrib.handleContainerCreation(containerCreateOptions, devcontainerConfig, docker);
        }

        // TODO add more config
        const container = await docker.createContainer(containerCreateOptions);
        const start = await container.start();
        console.log(start);

        return container;
    }

    protected getPortBindings(forwardPorts: (string | number)[]): { exposedPorts: {}, portBindings: {} } {
        const res: { exposedPorts: { [key: string]: {} }, portBindings: { [key: string]: {} } } = { exposedPorts: {}, portBindings: {} };
        for (const port of forwardPorts) {
            let portKey: string;
            let hostPort: string;
            if (typeof port === 'string') {
                const parts = port.split(':');
                portKey = isNaN(+parts[0]) ? parts[0] : `${parts[0]}/tcp`;
                hostPort = parts[1] ?? parts[0];
            } else {
                portKey = `${port}/tcp`;
                hostPort = port.toString();
            }
            res.exposedPorts[portKey] = {};
            res.portBindings[portKey] = [{ HostPort: hostPort }];
        }

        return res;
    }
}
