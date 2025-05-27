// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import { Emitter, Event } from '@theia/core';
import { RemoteConnection, RemoteExecOptions, RemoteExecResult, RemoteExecTester } from '@theia/remote/lib/electron-node/remote-types';
import { Socket } from 'net';
import { exec, spawn } from 'child_process';
import { Deferred } from '@theia/core/lib/common/promise-util';
import * as fs from 'fs';

export interface RemoteWslConnectionOptions {
    id: string;
    name: string;
    type: string;
    distribution: string;
}

export class RemoteWslConnection implements RemoteConnection {
    id: string;
    name: string;
    type: string;
    remotePort: number;
    distribution: string;

    get localPort(): number {
        return this.remotePort;
    }

    protected readonly onDidDisconnectEmitter = new Emitter<void>();
    onDidDisconnect: Event<void> = this.onDidDisconnectEmitter.event;

    constructor(options: RemoteWslConnectionOptions) {
        this.id = options.id;
        this.name = options.name;
        this.type = options.type;
        this.distribution = options.distribution;
    }

    async forwardOut(socket: Socket, port: number): Promise<void> {
        new Socket().connect(port, 'localhost', () => {
            socket.pipe(new Socket().connect(port, 'localhost'));
        });
    }

    async exec(cmd: string, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult> {
        const deferred = new Deferred<RemoteExecResult>();
        const fullCommand = `wsl -d ${this.distribution} ${cmd} ${args?.join(' ') ?? ''}`;

        try {
            exec(fullCommand, { env: options?.env }, (error, stdout, stderr) => {
                deferred.resolve({ stdout, stderr });
            });
        } catch (e) {
            deferred.reject(e);
        }

        return deferred.promise;
    }

    async execPartial(cmd: string, tester: RemoteExecTester, args?: string[], options?: RemoteExecOptions): Promise<RemoteExecResult> {
        const deferred = new Deferred<RemoteExecResult>();

        try {
            let cdPath = undefined;
            if (cmd.startsWith('cd') && cmd.includes(';')) {
                const parts = cmd.split(';');
                cdPath = parts[0].replace('cd', '').trim();
                cmd = parts[1];
            }
            const fullCommand = `wsl -d ${this.distribution} ${cdPath ? `--cd ${cdPath} ${cmd}` : cmd} ${args?.join(' ') ?? ''}`;

            const process = spawn(fullCommand, { env: options?.env, shell: 'powershell' });

            let stdoutBuffer = '';
            let stderrBuffer = '';

            process.stdout.on('data', (data: Buffer) => {
                if (deferred.state === 'unresolved') {
                    stdoutBuffer += data.toString();
                    if (tester(stdoutBuffer, stderrBuffer)) {
                        deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                    }
                }
            });

            process.stderr.on('data', (data: Buffer) => {
                if (deferred.state === 'unresolved') {
                    stderrBuffer += data.toString();
                    if (tester(stdoutBuffer, stderrBuffer)) {
                        deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                    }
                }
            });

            process.on('close', () => {
                if (deferred.state === 'unresolved') {
                    deferred.resolve({ stdout: stdoutBuffer, stderr: stderrBuffer });
                }
            });

            process.on('error', error => {
                deferred.reject(error);
            });
        } catch (e) {
            deferred.reject(e);
        }

        return deferred.promise;
    }

    async copy(localPath: string | Buffer | NodeJS.ReadableStream, remotePath: string): Promise<void> {
        const deferred = new Deferred<void>();
        const wslPath = `\\\\wsl$\\${this.distribution}\\${remotePath}`;

        if (typeof localPath === 'string') {
            exec(`copy "${localPath}" "${wslPath}"`, error => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve();
                }
            });
        } else if (Buffer.isBuffer(localPath)) {
            fs.writeFile(wslPath, localPath, (error: Error) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve();
                }
            });
        } else {
            const writeStream = fs.createWriteStream(wslPath);
            localPath.pipe(writeStream);
            writeStream.on('finish', () => deferred.resolve());
            writeStream.on('error', (error: Error) => deferred.reject(error));
        }

        return deferred.promise;
    }

    dispose(): void {
        this.onDidDisconnectEmitter.dispose();
    }

    disposeSync(): void {
        // No special cleanup needed for WSL
    }
}
