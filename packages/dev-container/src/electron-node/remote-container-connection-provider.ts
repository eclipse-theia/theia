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

import * as net from 'net';
import { RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { RemoteConnection, RemoteExecOptions, RemoteExecResult, RemoteExecTester, RemoteStatusReport } from '@theia/remote/lib/electron-node/remote-types';
import { RemoteSetupService } from '@theia/remote/lib/electron-node/setup/remote-setup-service';
import { RemoteConnectionService } from '@theia/remote/lib/electron-node/remote-connection-service';
import { RemoteProxyServerProvider } from '@theia/remote/lib/electron-node/remote-proxy-server-provider';
import { Emitter, Event, MessageService } from '@theia/core';
import { Socket } from 'net';
import { inject, injectable } from '@theia/core/shared/inversify';
import { v4 } from 'uuid';
import * as Docker from 'dockerode';
import { DockerContainerCreationService } from './docker-container-creation-service';

@injectable()
export class DevContainerConnectionProvider implements RemoteContainerConnectionProvider {

    @inject(RemoteConnectionService)
    protected readonly remoteConnectionService: RemoteConnectionService;

    @inject(RemoteSetupService)
    protected readonly remoteSetup: RemoteSetupService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(RemoteProxyServerProvider)
    protected readonly serverProvider: RemoteProxyServerProvider;

    @inject(DockerContainerCreationService)
    protected readonly containerCreationService: DockerContainerCreationService;

    async connectToContainer(): Promise<string> {
        const dockerConnection = new Docker();
        const version = await dockerConnection.version();

        if (!version) {
            this.messageService.error('Docker Daemon is not running');
            throw new Error('Docker is not running');
        }

        const progress = await this.messageService.showProgress({
            text: 'create container',
        });

        // create container
        progress.report({ message: 'Connecting to container' });

        const container = await this.containerCreationService.buildContainer(dockerConnection);

        // create actual connection
        const report: RemoteStatusReport = message => progress.report({ message });
        report('Connecting to remote system...');

        const remote = await this.createContainerConnection(container, dockerConnection);
        await this.remoteSetup.setup({
            connection: remote,
            report,
            nodeDownloadTemplate: ''
        });
        const registration = this.remoteConnectionService.register(remote);
        const server = await this.serverProvider.getProxyServer(socket => {
            remote.forwardOut(socket);
        });
        remote.onDidDisconnect(() => {
            server.close();
            registration.dispose();
        });
        const localPort = (server.address() as net.AddressInfo).port;
        remote.localPort = localPort;
        return localPort.toString();
    }

    async createContainerConnection(container: Docker.Container, docker: Docker): Promise<RemoteDockerContainerConnection> {
        return Promise.resolve(new RemoteDockerContainerConnection({
            id: v4(),
            name: 'dev-container',
            type: 'container',
            docker,
            container
        }));
    }

}

export interface RemoteContainerConnectionOptions {
    id: string;
    name: string;
    type: string;
    docker: Docker;
    container: Docker.Container;
}

export class RemoteDockerContainerConnection implements RemoteConnection {

    id: string;
    name: string;
    type: string;
    localPort: number;
    remotePort: number;

    docker: Docker;
    container: Docker.Container;

    protected readonly onDidDisconnectEmitter = new Emitter<void>();
    onDidDisconnect: Event<void> = this.onDidDisconnectEmitter.event;

    constructor(options: RemoteContainerConnectionOptions) {
        this.id = options.id;
        this.type = options.type;
        this.name = options.name;
        this.onDidDisconnect(() => this.dispose());

        this.docker = options.docker;
        this.container = options.container;
    }

    forwardOut(socket: Socket): void {
        throw new Error('Method not implemented.');
    }

    exec(cmd: string, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult> {
        throw new Error('Method not implemented.');
    }

    execPartial(cmd: string, tester: RemoteExecTester, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult> {
        throw new Error('Method not implemented.');
    }

    copy(localPath: string | Buffer | NodeJS.ReadableStream, remotePath: string): Promise<void> {
        throw new Error('Method not implemented.');
    }

    dispose(): void {
        throw new Error('Method not implemented.');
    }

}
