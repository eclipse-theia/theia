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

import { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import * as fs from '@theia/core/shared/fs-extra';
import * as Docker from 'dockerode';
import { LastContainerInfo } from '../electron-common/remote-container-connection-provider';

@injectable()
export class DockerContainerService {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    async getOrCreateContainer(docker: Docker, lastContainerInfo?: LastContainerInfo): Promise<[Docker.Container, number]> {
        let port = Math.floor(Math.random() * (49151 - 10000)) + 10000;
        let container;
        if (lastContainerInfo) {
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
                console.warn('DevContainer: could not find last used container ', e);
            }
        }
        if (!container) {
            container = await this.buildContainer(docker, port);
        }
        return [container, port];
    }

    async buildContainer(docker: Docker, port: number, from?: URI): Promise<Docker.Container> {
        const workspace = from ?? new URI(await this.workspaceServer.getMostRecentlyUsedWorkspace());
        if (!workspace) {
            throw new Error('No workspace');
        }

        const devcontainerFile = workspace.resolve('.devcontainer/devcontainer.json');
        const devcontainerConfig = JSON.parse(await fs.readFile(devcontainerFile.path.fsPath(), 'utf-8').catch(() => '0'));

        if (!devcontainerConfig) {
            // TODO add ability for user to create new config
            throw new Error('No devcontainer.json');
        }

        await docker.pull(devcontainerConfig.image);

        const { exposedPorts, portBindings } = this.getPortBindings(devcontainerConfig.forwardPorts);

        // TODO add more config
        const container = await docker.createContainer({
            Image: devcontainerConfig.image,
            Tty: true,
            ExposedPorts: {
                [`${port}/tcp`]: {},
                ...exposedPorts
            },
            HostConfig: {
                PortBindings: {
                    [`${port}/tcp`]: [{ HostPort: '0' }],
                    ...portBindings
                },
                Mounts: [{
                    Source: workspace.path.toString(),
                    Target: `/workspaces/${workspace.path.name}`,
                    Type: 'bind'
                }]
            }
        });
        const start = await container.start();
        console.log(start);

        return container;
    }

    getPortBindings(forwardPorts: (string | number)[]): { exposedPorts: {}, portBindings: {} } {
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
