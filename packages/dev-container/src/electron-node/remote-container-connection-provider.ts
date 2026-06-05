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
import { PassThrough } from 'stream';
import {
    AttachContainerArgs, AttachContainerOptions, ContainerConnectionOptions, ContainerConnectionResult,
    DevContainerFile, RemoteContainerConnectionProvider, RunningContainerInfo, WorkspaceCandidate
} from '../electron-common/remote-container-connection-provider';
import { RemoteConnectionService } from '@theia/remote/lib/electron-node/remote-connection-service';
import { RemoteSetupService } from '@theia/remote/lib/electron-node/setup/remote-setup-service';
import { RemoteProxyServerProvider } from '@theia/remote/lib/electron-node/remote-proxy-server-provider';
import { RemoteStatusReport } from '@theia/remote/lib/electron-node/remote-types';
import { RpcServer, ILogger, MessageService, generateUuid, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as Docker from 'dockerode';
import { DevContainerFileService } from './dev-container-file-service';
import { DockerContainerService } from './docker-container-service';
import { ContainerOutputProvider } from '../electron-common/container-output-provider';
import { DevContainerCliContribution } from './dev-container-cli-contribution';
import { RemoteDockerContainerConnection } from './remote-docker-container-connection';
// Re-export for backward compatibility — these types were moved to remote-docker-container-connection.ts
export { RemoteDockerContainerConnection, RemoteContainerConnectionOptions } from './remote-docker-container-connection';
import { DevContainerConfiguration } from './devcontainer-file';
import { getWorkspaceMounts, inferWorkspacePath } from './devcontainer-util';
import { VariableContext } from './devcontainer-contributions/variable-resolver-contribution';

@injectable()
export class DevContainerConnectionProvider implements RemoteContainerConnectionProvider, RpcServer<ContainerOutputProvider> {

    @inject(RemoteConnectionService)
    protected readonly remoteConnectionService: RemoteConnectionService;

    @inject(RemoteSetupService)
    protected readonly remoteSetup: RemoteSetupService;

    @inject(RemoteProxyServerProvider)
    protected readonly serverProvider: RemoteProxyServerProvider;

    @inject(DockerContainerService)
    protected readonly containerService: DockerContainerService;

    @inject(DevContainerFileService)
    protected readonly devContainerFileService: DevContainerFileService;

    @inject(DevContainerCliContribution)
    protected readonly cliContribution: DevContainerCliContribution;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected outputProvider: ContainerOutputProvider | undefined;

    setClient(client: ContainerOutputProvider): void {
        this.outputProvider = client;
    }

    async createDockerConnection(): Promise<Docker> {
        const dockerOptions: Docker.DockerOptions = {};
        const dockerHost = process.env.DOCKER_HOST;

        try {
            if (dockerHost) {
                const dockerHostURL = new URL(dockerHost);

                if (dockerHostURL.protocol === 'unix:') {
                    dockerOptions.socketPath = dockerHostURL.pathname;
                } else {
                    if (dockerHostURL.protocol === 'http:') {
                        dockerOptions.protocol = 'http';
                    } else if (dockerHostURL.protocol === 'https:') {
                        dockerOptions.protocol = 'https';
                    } else if (dockerHostURL.protocol === 'ssh:') {
                        dockerOptions.protocol = 'ssh';
                    } else {
                        dockerOptions.protocol = undefined;
                    }
                    dockerOptions.port = parseInt(dockerHostURL.port) || undefined;
                    dockerOptions.username = dockerHostURL.username || undefined;
                }
            }
        } catch (_) {
            this.logger.warn(`Ignoring invalid DOCKER_HOST=${dockerHost}`);
        }

        const dockerConnection = new Docker(dockerOptions);
        await dockerConnection.version()
            .catch(e => {
                this.logger.error('Docker Error:', e);
                throw new Error(`Docker is not available: ${e.message ?? e}`);
            });

        return dockerConnection;
    }

    async listRunningContainers(docker?: Docker): Promise<RunningContainerInfo[]> {
        docker ??= await this.createDockerConnection();
        const containers = await docker.listContainers({ all: false });

        return containers.map(container => ({
            id: container.Id.substring(0, 12),
            name: (container.Names[0] || '').replace(/^\//, ''),
            image: container.Image,
            status: container.Status,
            created: container.Created
        }));
    }

    async getWorkspaceCandidates(containerId: string, docker?: Docker): Promise<WorkspaceCandidate[]> {
        docker ??= await this.createDockerConnection();
        const container = docker.getContainer(containerId);
        const info = await container.inspect();
        const candidates: WorkspaceCandidate[] = [];
        const seen = new Set<string>();

        // Check for devcontainer metadata label (set by tools that created the container)
        const metadataLabel = info.Config.Labels?.['devcontainer.metadata'];
        if (metadataLabel) {
            try {
                const metadata = JSON.parse(metadataLabel);
                if (Array.isArray(metadata)) {
                    for (const entry of metadata) {
                        if (entry.remoteWorkspaceFolder && !seen.has(entry.remoteWorkspaceFolder)) {
                            seen.add(entry.remoteWorkspaceFolder);
                            candidates.push({ path: entry.remoteWorkspaceFolder, source: 'devcontainer-label' });
                        }
                    }
                }
            } catch {
                // ignore malformed metadata
            }
        }

        const localFolderLabel = info.Config.Labels?.['devcontainer.local_folder'];
        if (localFolderLabel) {
            const basename = URI.fromFilePath(localFolderLabel).path.base;
            if (basename) {
                const workspacePath = `/workspaces/${basename}`;
                if (!seen.has(workspacePath)) {
                    seen.add(workspacePath);
                    candidates.push({ path: workspacePath, source: 'devcontainer-label' });
                }
            }
        }

        if (info.Config.WorkingDir && info.Config.WorkingDir !== '/' && !seen.has(info.Config.WorkingDir)) {
            seen.add(info.Config.WorkingDir);
            candidates.push({ path: info.Config.WorkingDir, source: 'working-dir' });
        }

        for (const mount of getWorkspaceMounts(info.Mounts ?? [])) {
            if (!seen.has(mount.Destination)) {
                seen.add(mount.Destination);
                candidates.push({ path: mount.Destination, source: 'bind-mount' });
            }
        }

        if (!seen.has('/')) {
            candidates.push({ path: '/', source: 'fallback' });
        }

        return candidates;
    }

    async scanForDevContainerConfig(containerId: string, workspacePath: string, docker?: Docker): Promise<string | undefined> {
        docker ??= await this.createDockerConnection();
        const container = docker.getContainer(containerId);

        // Search all three standard devcontainer.json locations:
        //   <workspace>/.devcontainer/devcontainer.json
        //   <workspace>/.devcontainer.json
        //   <workspace>/.devcontainer/<subfolder>/devcontainer.json
        // Uses a single find command to avoid multiple exec round-trips.
        try {
            // Use Cmd array form instead of sh -c to avoid shell injection.
            // stderr (e.g. "No such file or directory" when .devcontainer doesn't exist)
            // is demuxed to a separate stream and discarded.
            const execution = await container.exec({
                Cmd: [
                    'find',
                    `${workspacePath}/.devcontainer`, `${workspacePath}/.devcontainer.json`,
                    '-maxdepth', '2',
                    '(', '-name', 'devcontainer.json', '-o', '-name', '.devcontainer.json', ')',
                    '-type', 'f'
                ],
                AttachStdout: true,
                AttachStderr: true
            });

            let stdout = '';
            const stream = await execution.start({});
            const stdoutPassthrough = new PassThrough();
            const stderrPassthrough = new PassThrough();
            stdoutPassthrough.on('data', (chunk: Buffer) => {
                stdout += chunk.toString();
            });
            execution.modem.demuxStream(stream, stdoutPassthrough, stderrPassthrough);

            await new Promise<void>((resolve, reject) => {
                stream.on('end', () => resolve());
                stream.on('error', reject);
            });
            stdoutPassthrough.destroy();
            stderrPassthrough.destroy();

            const found = stdout.trim().split('\n').filter(line => line.length > 0);
            if (found.length === 0) {
                return undefined;
            }

            // Prefer the standard location, then root-level, then subfolder configs
            const standardPath = `${workspacePath}/.devcontainer/devcontainer.json`;
            const rootPath = `${workspacePath}/.devcontainer.json`;
            for (const preferred of [standardPath, rootPath]) {
                if (found.includes(preferred)) {
                    return preferred;
                }
            }
            // Return the first subfolder config found
            return found[0];
        } catch (e) {
            // find/sh might not be available in minimal containers
            this.logger.debug('Failed to scan for devcontainer.json in container:', e);
            return undefined;
        }
    }

    async connectToContainer(options: ContainerConnectionOptions): Promise<ContainerConnectionResult> {
        const progress = await this.messageService.showProgress({ text: 'Creating container' });
        try {
            const report: RemoteStatusReport = message => progress.report({ message });
            const docker = await this.createDockerConnection();

            let remote: RemoteDockerContainerConnection | undefined;
            try {
                const container = await this.containerService.getOrCreateContainer(docker, options, this.outputProvider);
                const context: VariableContext = { containerId: container.id };
                const devContainerConfig = await this.devContainerFileService.getConfiguration(options.devcontainerFile, context);

                report('Connecting to remote system...');

                const result = await this.setupRemoteConnection(container, docker, devContainerConfig, options.nodeDownloadTemplate, report);
                remote = result.remote;

                await this.containerService.postConnect(options.devcontainerFile, remote, this.outputProvider, context);

                return {
                    containerId: container.id,
                    workspacePath: devContainerConfig.workspaceFolder ?? inferWorkspacePath(await container.inspect()),
                    port: result.localPort.toString(),
                };
            } catch (e) {
                remote?.dispose();
                this.logger.error(e);
                throw e;
            }
        } catch (e) {
            this.messageService.error(e.message);
            throw e;
        } finally {
            progress.cancel();
        }
    }

    getDevContainerFiles(workspacePath: string): Promise<DevContainerFile[]> {
        return this.devContainerFileService.getAvailableFiles(workspacePath);
    }

    async getAttachContainerArgs(): Promise<AttachContainerArgs | undefined> {
        const containerId = this.cliContribution.consumeAttachContainerId();
        if (!containerId) {
            return undefined;
        }
        return {
            containerId,
            scanForDevJson: this.cliContribution.shouldScanForDevJson()
        };
    }

    async attachToContainer(options: AttachContainerOptions): Promise<ContainerConnectionResult> {
        const progress = await this.messageService.showProgress({ text: 'Attaching to container' });
        try {
            const report: RemoteStatusReport = message => progress.report({ message });
            const docker = await this.createDockerConnection();
            const container = docker.getContainer(options.containerId);

            const containerInfo = await container.inspect();
            if (!containerInfo.State.Running) {
                throw new Error(`Container ${options.containerId} is not running`);
            }

            const context: VariableContext = { containerId: options.containerId };
            let config: DevContainerConfiguration;
            if (options.devcontainerFile) {
                config = await this.devContainerFileService.getConfiguration(options.devcontainerFile, context);
                config = { ...config, shutdownAction: 'none' };
            } else {
                config = { name: containerInfo.Name.replace(/^\//, ''), shutdownAction: 'none' } as DevContainerConfiguration;
            }

            let remote: RemoteDockerContainerConnection | undefined;
            try {
                report('Connecting to remote system...');

                const result = await this.setupRemoteConnection(container, docker, config, options.nodeDownloadTemplate, report);
                remote = result.remote;

                if (options.devcontainerFile) {
                    await this.containerService.postConnect(options.devcontainerFile, remote, this.outputProvider, context);
                }

                return {
                    containerId: container.id,
                    workspacePath: options.workspacePath,
                    port: result.localPort.toString(),
                };
            } catch (e) {
                remote?.dispose();
                this.logger.error(e);
                throw e;
            }
        } catch (e) {
            this.messageService.error(e.message);
            throw e;
        } finally {
            progress.cancel();
        }
    }

    async getCurrentContainerInfo(port: number): Promise<Docker.ContainerInspectInfo | undefined> {
        const connection = this.remoteConnectionService.getConnectionFromPort(port);
        if (!connection || !(connection instanceof RemoteDockerContainerConnection)) {
            return undefined;
        }
        return connection.container.inspect();
    }

    async removeContainer(containerId: string): Promise<void> {
        return this.doRemoveContainer(containerId);
    }

    protected async doRemoveContainer(containerId: string, docker?: Docker): Promise<void> {
        docker ??= await this.createDockerConnection();
        const container = docker.getContainer(containerId);
        try {
            const info = await container.inspect();
            if (info.State.Running) {
                await container.stop();
            }
            await container.remove();
        } catch (e) {
            this.logger.error('Failed to remove container:', e);
            throw e;
        }
    }

    /**
     * Creates a remote connection, runs setup (injecting the Theia backend into the container),
     * registers the connection, and starts a local proxy server.
     *
     * @returns the local proxy port and the remote connection
     */
    protected async setupRemoteConnection(
        container: Docker.Container, docker: Docker, config: DevContainerConfiguration,
        nodeDownloadTemplate: string | undefined, report: RemoteStatusReport
    ): Promise<{ localPort: number; remote: RemoteDockerContainerConnection }> {
        const remote = new RemoteDockerContainerConnection({
            id: generateUuid(),
            name: config.name ?? 'dev-container',
            type: 'Dev Container',
            docker,
            container,
            config,
            logger: this.logger
        });

        let result;
        try {
            result = await this.remoteSetup.setup({
                connection: remote,
                report,
                nodeDownloadTemplate
            });
        } catch (e) {
            remote.dispose();
            throw e;
        }
        remote.remoteSetupResult = result;

        let registration: { dispose(): void } | undefined;
        let server: net.Server | undefined;
        try {
            registration = this.remoteConnectionService.register(remote);
            server = await this.serverProvider.getProxyServer(socket => {
                remote.forwardOut(socket);
            });
        } catch (e) {
            server?.close();
            registration?.dispose();
            remote.dispose();
            throw e;
        }
        remote.onDidDisconnect(() => {
            server.close();
            registration.dispose();
        });

        const localPort = (server.address() as net.AddressInfo).port;
        remote.localPort = localPort;
        return { localPort, remote };
    }

    dispose(): void {
        this.outputProvider = undefined;
    }
}
