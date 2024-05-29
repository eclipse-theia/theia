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
import {
    ContainerConnectionOptions, ContainerConnectionResult,
    DevContainerFile, RemoteContainerConnectionProvider
} from '../electron-common/remote-container-connection-provider';
import { RemoteConnection, RemoteExecOptions, RemoteExecResult, RemoteExecTester, RemoteStatusReport } from '@theia/remote/lib/electron-node/remote-types';
import { RemoteSetupResult, RemoteSetupService } from '@theia/remote/lib/electron-node/setup/remote-setup-service';
import { RemoteConnectionService } from '@theia/remote/lib/electron-node/remote-connection-service';
import { RemoteProxyServerProvider } from '@theia/remote/lib/electron-node/remote-proxy-server-provider';
import { Emitter, Event, generateUuid, MessageService, RpcServer } from '@theia/core';
import { Socket } from 'net';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as Docker from 'dockerode';
import { DockerContainerService } from './docker-container-service';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WriteStream } from 'tty';
import { PassThrough } from 'stream';
import { exec } from 'child_process';
import { DevContainerFileService } from './dev-container-file-service';
import { ContainerOutputProvider } from '../electron-common/container-output-provider';

@injectable()
export class DevContainerConnectionProvider implements RemoteContainerConnectionProvider, RpcServer<ContainerOutputProvider> {

    @inject(RemoteConnectionService)
    protected readonly remoteConnectionService: RemoteConnectionService;

    @inject(RemoteSetupService)
    protected readonly remoteSetup: RemoteSetupService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(RemoteProxyServerProvider)
    protected readonly serverProvider: RemoteProxyServerProvider;

    @inject(DockerContainerService)
    protected readonly containerService: DockerContainerService;

    @inject(DevContainerFileService)
    protected readonly devContainerFileService: DevContainerFileService;

    @inject(RemoteConnectionService)
    protected readonly remoteService: RemoteConnectionService;

    protected outputProvider: ContainerOutputProvider | undefined;

    setClient(client: ContainerOutputProvider): void {
        this.outputProvider = client;
    }

    async connectToContainer(options: ContainerConnectionOptions): Promise<ContainerConnectionResult> {
        const dockerConnection = new Docker();
        const version = await dockerConnection.version().catch(() => undefined);

        if (!version) {
            this.messageService.error('Docker Daemon is not running');
            throw new Error('Docker is not running');
        }

        // create container
        const progress = await this.messageService.showProgress({
            text: 'Creating container',
        });
        try {
            const container = await this.containerService.getOrCreateContainer(dockerConnection, options.devcontainerFile, options.lastContainerInfo, this.outputProvider);
            const devContainerConfig = await this.devContainerFileService.getConfiguration(options.devcontainerFile);

            // create actual connection
            const report: RemoteStatusReport = message => progress.report({ message });
            report('Connecting to remote system...');

            const remote = await this.createContainerConnection(container, dockerConnection, devContainerConfig.name);
            const result = await this.remoteSetup.setup({
                connection: remote,
                report,
                nodeDownloadTemplate: options.nodeDownloadTemplate
            });
            remote.remoteSetupResult = result;

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

            await this.containerService.postConnect(options.devcontainerFile, remote, this.outputProvider);

            return {
                containerId: container.id,
                workspacePath: (await container.inspect()).Mounts[0].Destination,
                port: localPort.toString(),
            };
        } catch (e) {
            this.messageService.error(e.message);
            console.error(e);
            throw e;
        } finally {
            progress.cancel();
        }
    }

    getDevContainerFiles(): Promise<DevContainerFile[]> {
        return this.devContainerFileService.getAvailableFiles();
    }

    async createContainerConnection(container: Docker.Container, docker: Docker, name?: string): Promise<RemoteDockerContainerConnection> {
        return Promise.resolve(new RemoteDockerContainerConnection({
            id: generateUuid(),
            name: name ?? 'dev-container',
            type: 'Dev Container',
            docker,
            container,
        }));
    }

    async getCurrentContainerInfo(port: number): Promise<Docker.ContainerInspectInfo | undefined> {
        const connection = this.remoteConnectionService.getConnectionFromPort(port);
        if (!connection || !(connection instanceof RemoteDockerContainerConnection)) {
            return undefined;
        }
        return connection.container.inspect();
    }

    dispose(): void {

    }

}

export interface RemoteContainerConnectionOptions {
    id: string;
    name: string;
    type: string;
    docker: Docker;
    container: Docker.Container;
}

interface ContainerTerminalSession {
    execution: Docker.Exec,
    stdout: WriteStream,
    stderr: WriteStream,
    executeCommand(cmd: string, args?: string[]): Promise<{ stdout: string, stderr: string }>;
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

    remoteSetupResult: RemoteSetupResult;

    protected activeTerminalSession: ContainerTerminalSession | undefined;

    protected readonly onDidDisconnectEmitter = new Emitter<void>();
    onDidDisconnect: Event<void> = this.onDidDisconnectEmitter.event;

    constructor(options: RemoteContainerConnectionOptions) {
        this.id = options.id;
        this.type = options.type;
        this.name = options.name;

        this.docker = options.docker;
        this.container = options.container;

        this.docker.getEvents({ filters: { container: [this.container.id], event: ['stop'] } }).then(stream => {
            stream.on('data', () => this.onDidDisconnectEmitter.fire());
        });
    }

    async forwardOut(socket: Socket, port?: number): Promise<void> {
        const node = `${this.remoteSetupResult.nodeDirectory}/bin/node`;
        const devContainerServer = `${this.remoteSetupResult.applicationDirectory}/backend/dev-container-server.js`;
        try {
            const ttySession = await this.container.exec({
                Cmd: ['sh', '-c', `${node} ${devContainerServer} -target-port=${port ?? this.remotePort}`],
                AttachStdin: true, AttachStdout: true, AttachStderr: true
            });

            const stream = await ttySession.start({ hijack: true, stdin: true });

            socket.pipe(stream);
            ttySession.modem.demuxStream(stream, socket, socket);
        } catch (e) {
            console.error(e);
        }
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
            stream?.addListener('close', () => deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer }));
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
                    deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
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

    async dispose(): Promise<void> {
        // cant use dockerrode here since this needs to happen on one tick
        exec(`docker stop ${this.container.id}`);
    }

}
