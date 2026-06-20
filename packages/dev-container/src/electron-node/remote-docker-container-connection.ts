// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { RemoteConnection, RemoteExecOptions, RemoteExecResult, RemoteExecTester } from '@theia/remote/lib/electron-node/remote-types';
import { RemoteSetupResult } from '@theia/remote/lib/electron-node/setup/remote-setup-service';
import { Emitter, Event, ILogger } from '@theia/core';
import { BashQuotingFunctions, ShellQuoting, createShellCommandLine } from '@theia/core/lib/common/shell-quoting';
import { Socket } from 'net';
import * as Docker from 'dockerode';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PassThrough } from 'stream';
import { execFile, execFileSync } from 'child_process';
import { DevContainerConfiguration } from './devcontainer-file';
import { resolveComposeFilePath } from './docker-compose/compose-service';

export interface RemoteContainerConnectionOptions {
    id: string;
    name: string;
    type: string;
    docker: Docker;
    container: Docker.Container;
    config: DevContainerConfiguration;
    logger: ILogger;
}

export class RemoteDockerContainerConnection implements RemoteConnection {

    id: string;
    name: string;
    type: string;
    localPort: number;
    remotePort: number;

    docker: Docker;
    container: Docker.Container;

    remoteSetupResult!: RemoteSetupResult;

    protected readonly logger: ILogger;

    protected config: DevContainerConfiguration;

    protected dockerEventStream: NodeJS.ReadableStream | undefined;

    protected readonly onDidDisconnectEmitter = new Emitter<void>();
    onDidDisconnect: Event<void> = this.onDidDisconnectEmitter.event;

    constructor(options: RemoteContainerConnectionOptions) {
        this.id = options.id;
        this.type = options.type;
        this.name = options.name;

        this.docker = options.docker;
        this.container = options.container;

        this.config = options.config;
        this.logger = options.logger;

        this.docker.getEvents({ filters: { container: [this.container.id], event: ['stop'] } }).then(stream => {
            this.dockerEventStream = stream;
            stream.on('data', () => this.onDidDisconnectEmitter.fire());
        }).catch(e => {
            this.logger.error('Failed to register Docker event listener:', e);
        });
    }

    protected getRemoteEnv(): string[] | undefined {
        const remoteEnv = this.config.remoteEnv;
        if (!remoteEnv || Object.keys(remoteEnv).length === 0) {
            return undefined;
        }
        const entries = Object.entries(remoteEnv)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`);
        return entries.length > 0 ? entries : undefined;
    }

    /**
     * Builds a shell command string safe for use with `sh -c`.
     * Arguments are strong-quoted (single quotes) using {@link BashQuotingFunctions}
     * so that no shell expansion occurs inside them.
     *
     * **`cmd` is not escaped** and must only contain trusted, internally-constructed
     * values. All untrusted input must be passed via `args`.
     */
    protected buildShellCommand(cmd: string, args?: string[]): string {
        if (!args || args.length === 0) {
            return cmd;
        }
        return `${cmd} ${createShellCommandLine(args.map(a => ({ value: a, quoting: ShellQuoting.Strong })), BashQuotingFunctions)}`;
    }

    async forwardOut(socket: Socket, port?: number): Promise<void> {
        const node = `${this.remoteSetupResult.nodeDirectory}/bin/node`;
        const devContainerServer = `${this.remoteSetupResult.applicationDirectory}/backend/dev-container-server.js`;
        try {
            const ttySession = await this.container.exec({
                Cmd: ['sh', '-c', this.buildShellCommand(node, [devContainerServer, `-target-port=${port ?? this.remotePort}`])],
                Env: this.getRemoteEnv(),
                AttachStdin: true, AttachStdout: true, AttachStderr: true
            });

            const stream = await ttySession.start({ hijack: true, stdin: true });

            socket.pipe(stream);
            ttySession.modem.demuxStream(stream, socket, socket);
        } catch (e) {
            this.logger.error('Failed to forward socket:', e);
        }
    }

    async exec(cmd: string, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult> {
        const deferred = new Deferred<RemoteExecResult>();
        try {
            // TODO add windows container support
            const execution = await this.container.exec({
                Cmd: ['sh', '-c', this.buildShellCommand(cmd, args)], Env: this.getRemoteEnv(), AttachStdout: true, AttachStderr: true
            });
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
            const execution = await this.container.exec({
                Cmd: ['sh', '-c', this.buildShellCommand(cmd, args)], Env: this.getRemoteEnv(), AttachStdout: true, AttachStderr: true
            });
            let stdoutBuffer = '';
            let stderrBuffer = '';
            const stream = await execution?.start({});

            const cleanupStreams = (): void => {
                stdout.destroy();
                stderr.destroy();
                stream.destroy();
            };

            stream.on('close', () => {
                if (deferred.state === 'unresolved') {
                    deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                }
            });
            const stdout = new PassThrough();
            stdout.on('data', (data: Buffer) => {
                this.logger.debug('REMOTE STDOUT:', data.toString());
                if (deferred.state === 'unresolved') {
                    stdoutBuffer += data.toString();

                    if (tester(stdoutBuffer, stderrBuffer)) {
                        deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                        cleanupStreams();
                    }
                }
            });
            const stderr = new PassThrough();
            stderr.on('data', (data: Buffer) => {
                this.logger.debug('REMOTE STDERR:', data.toString());
                if (deferred.state === 'unresolved') {
                    stderrBuffer += data.toString();

                    if (tester(stdoutBuffer, stderrBuffer)) {
                        deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                        cleanupStreams();
                    }
                }
            });
            execution.modem.demuxStream(stream, stdout, stderr);
        } catch (e) {
            deferred.reject(e);
        }
        return deferred.promise;
    }

    getDockerHost(): string[] {
        const dockerHost = process.env.DOCKER_HOST;
        try {
            if (dockerHost) {
                const dockerHostURL = new URL(dockerHost);
                if (dockerHostURL.protocol === 'http:' || dockerHostURL.protocol === 'https:') {
                    dockerHostURL.protocol = 'tcp:';
                }
                return ['-H', dockerHostURL.href];
            }
        } catch (e) {
            this.logger.error('Failed to parse DOCKER_HOST:', e);
        }

        return [];
    }

    async copy(localPath: string, remotePath: string): Promise<void> {
        const deferred = new Deferred<void>();
        const hostArgs = this.getDockerHost();

        const subprocess = execFile('docker', [...hostArgs, 'cp', '-a', localPath, `${this.container.id}:${remotePath}`]);

        let stderr = '';
        subprocess.stderr?.on('data', data => {
            stderr += data.toString();
        });
        subprocess.on('close', code => {
            if (code === 0) {
                deferred.resolve();
            } else {
                deferred.reject(stderr);
            }
        });
        return deferred.promise;
    }

    disposeSync(): void {
        // cant use dockerode here since this needs to happen on one tick
        this.shutdownContainer(true);
        this.onDidDisconnectEmitter.dispose();
        if (this.dockerEventStream) {
            (this.dockerEventStream as import('stream').Readable).destroy();
            this.dockerEventStream = undefined;
        }
    }

    async dispose(): Promise<void> {
        await this.shutdownContainer(false);
        this.onDidDisconnectEmitter.dispose();
        if (this.dockerEventStream) {
            (this.dockerEventStream as import('stream').Readable).destroy();
            this.dockerEventStream = undefined;
        }
    }

    protected async shutdownContainer(sync: boolean): Promise<unknown> {
        const hostArgs = this.getDockerHost();

        const shutdownAction = this.config.shutdownAction ?? (this.config.dockerComposeFile ? 'stopCompose' : 'stopContainer');

        if (shutdownAction === 'none') {
            return;
        }

        if (shutdownAction === 'stopContainer') {
            return sync ? execFileSync('docker', [...hostArgs, 'stop', this.container.id]) : this.container.stop();
        } else if (shutdownAction === 'stopCompose') {
            if (!this.config.dockerComposeFile) {
                this.logger.warn('shutdownAction is stopCompose but dockerComposeFile is not defined, falling back to stopContainer');
                return sync ? execFileSync('docker', [...hostArgs, 'stop', this.container.id]) : this.container.stop();
            }
            const composeFilePath = resolveComposeFilePath(this.config);
            return sync ? execFileSync('docker', [...hostArgs, 'compose', '-f', composeFilePath, 'stop']) :
                new Promise<void>((res, rej) => execFile('docker', [...hostArgs, 'compose', '-f', composeFilePath, 'stop'], err => {
                    if (err) {
                        this.logger.error('Failed to stop compose:', err);
                        rej(err);
                    } else {
                        res();
                    }
                }));
        }

    }

}
