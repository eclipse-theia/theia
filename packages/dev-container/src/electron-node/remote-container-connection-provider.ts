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
import { ContainerConnectionOptions, RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
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
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WriteStream } from 'tty';
import { PassThrough } from 'stream';
import { exec } from 'child_process';

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

    async connectToContainer(options: ContainerConnectionOptions): Promise<string> {
        const dockerConnection = new Docker();
        const version = await dockerConnection.version().catch(() => undefined);

        if (!version) {
            this.messageService.error('Docker Daemon is not running');
            throw new Error('Docker is not running');
        }

        // create container
        const progress = await this.messageService.showProgress({
            text: 'create container',
        });
        try {
            const port = Math.floor(Math.random() * (49151 - 10000)) + 10000;
            const container = await this.containerCreationService.buildContainer(dockerConnection, port);

            // create actual connection
            const report: RemoteStatusReport = message => progress.report({ message });
            report('Connecting to remote system...');

            const remote = await this.createContainerConnection(container, dockerConnection, port);
            await this.remoteSetup.setup({
                connection: remote,
                report,
                nodeDownloadTemplate: options.nodeDownloadTemplate
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
        } catch (e) {
            this.messageService.error(e.message);
            console.error(e);
            throw e;
        } finally {
            progress.cancel();
        }
    }

    async createContainerConnection(container: Docker.Container, docker: Docker, port: number): Promise<RemoteDockerContainerConnection> {
        return Promise.resolve(new RemoteDockerContainerConnection({
            id: v4(),
            name: 'dev-container',
            type: 'container',
            docker,
            container,
            port
        }));
    }

}

export interface RemoteContainerConnectionOptions {
    id: string;
    name: string;
    type: string;
    docker: Docker;
    container: Docker.Container;
    port: number;
}

interface ContainerTerminalSession {
    execution: Docker.Exec,
    stdout: WriteStream,
    stderr: WriteStream,
    executeCommand(cmd: string, args?: string[]): Promise<{ stdout: string, stderr: string }>;
}

export class RemoteDockerContainerConnection implements RemoteConnection {

    id: string;
    name: string;
    type: string;
    localPort: number;
    remotePort: number;

    docker: Docker;
    container: Docker.Container;

    containerInfo: Docker.ContainerInspectInfo | undefined;

    protected activeTerminalSession: ContainerTerminalSession | undefined;

    protected readonly onDidDisconnectEmitter = new Emitter<void>();
    onDidDisconnect: Event<void> = this.onDidDisconnectEmitter.event;

    constructor(options: RemoteContainerConnectionOptions) {
        this.id = options.id;
        this.type = options.type;
        this.name = options.name;
        this.onDidDisconnect(() => this.dispose());

        this.docker = options.docker;
        this.container = options.container;
        this.remotePort = options.port;
    }

    async forwardOut(socket: Socket): Promise<void> {
        if (!this.containerInfo) {
            this.containerInfo = await this.container.inspect();
        }
        const portMapping = this.containerInfo.NetworkSettings.Ports[`${this.remotePort}/tcp`][0];
        const connectSocket = new Socket({ readable: true, writable: true }).connect(parseInt(portMapping.HostPort), portMapping.HostIp);
        socket.pipe(connectSocket);
        connectSocket.pipe(socket);
    }

    async exec(cmd: string, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult> {
        // return (await this.getOrCreateTerminalSession()).executeCommand(cmd, args);
        const deferred = new Deferred<RemoteExecResult>();
        try {
            // TODO add windows container support
            const execution = await this.container.exec({ Cmd: ['sh', '-c', `${cmd} ${args?.join(' ') ?? ''}`], AttachStdout: true, AttachStderr: true });
            let stdoutBuffer = '';
            let stderrBuffer = '';
            const stream = await execution?.start({});
            const stdout = new PassThrough();
            stdout.on('data', (chunk: Buffer) => {
                stdoutBuffer += chunk.toString();
            });
            const stderr = new PassThrough();
            stderr.on('data', (chunk: Buffer) => {
                stderrBuffer += chunk.toString();
            });
            execution.modem.demuxStream(stream, stdout, stderr);
            stream?.addListener('close', () => deferred.resolve({ stdout: stdoutBuffer.toString(), stderr: stderrBuffer.toString() }));
        } catch (e) {
            deferred.reject(e);
        }
        return deferred.promise;
    }

    async execPartial(cmd: string, tester: RemoteExecTester, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult> {
        const deferred = new Deferred<RemoteExecResult>();
        try {
            // TODO add windows container support
            const execution = await this.container.exec({ Cmd: ['sh', '-c', `${cmd} ${args?.join(' ') ?? ''}`], AttachStdout: true, AttachStderr: true });
            let stdoutBuffer = '';
            let stderrBuffer = '';
            const stream = await execution?.start({});
            stream.on('close', () => {
                if (deferred.state === 'unresolved') {
                    deferred.resolve({ stdout: stdoutBuffer.toString(), stderr: stderrBuffer.toString() });
                }
            });
            const stdout = new PassThrough();
            stdout.on('data', (data: Buffer) => {
                if (deferred.state === 'unresolved') {
                    stdoutBuffer += data.toString();

                    if (tester(stdoutBuffer, stderrBuffer)) {
                        deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                    }
                }
            });
            const stderr = new PassThrough();
            stderr.on('data', (data: Buffer) => {
                if (deferred.state === 'unresolved') {
                    stderrBuffer += data.toString();

                    if (tester(stdoutBuffer, stderrBuffer)) {
                        deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                    }
                }
            });
            execution.modem.demuxStream(stream, stdout, stderr);
        } catch (e) {
            deferred.reject(e);
        }
        return deferred.promise;
    }

    async copy(localPath: string | Buffer | NodeJS.ReadableStream, remotePath: string): Promise<void> {
        const deferred = new Deferred<void>();
        const process = exec(`docker cp -qa ${localPath.toString()} ${this.container.id}:${remotePath}`);

        let stderr = '';
        process.stderr?.on('data', data => {
            stderr += data.toString();
        });
        process.on('close', code => {
            if (code === 0) {
                deferred.resolve();
            } else {
                deferred.reject(stderr);
            }
        });
        return deferred.promise;
    }

    dispose(): void {
        this.container.stop();
    }

}
