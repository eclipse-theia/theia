// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import * as ssh2 from 'ssh2';
import * as net from 'net';
import * as fs from '@theia/core/shared/fs-extra';
import SftpClient = require('ssh2-sftp-client');
import SshConfig from 'ssh-config';
import { Emitter, Event, MessageService, QuickInputService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RemoteSSHConnectionProvider, RemoteSSHConnectionProviderOptions, SSHConfig } from '../../electron-common/remote-ssh-connection-provider';
import { RemoteConnectionService } from '../remote-connection-service';
import { RemoteProxyServerProvider } from '../remote-proxy-server-provider';
import { RemoteConnection, RemoteExecOptions, RemoteExecResult, RemoteExecTester, RemoteStatusReport } from '../remote-types';
import { Deferred, timeout } from '@theia/core/lib/common/promise-util';
import { SSHIdentityFileCollector, SSHKey } from './ssh-identity-file-collector';
import { RemoteSetupService } from '../setup/remote-setup-service';
import { generateUuid } from '@theia/core/lib/common/uuid';

@injectable()
export class RemoteSSHConnectionProviderImpl implements RemoteSSHConnectionProvider {

    @inject(RemoteConnectionService)
    protected readonly remoteConnectionService: RemoteConnectionService;

    @inject(RemoteProxyServerProvider)
    protected readonly serverProvider: RemoteProxyServerProvider;

    @inject(SSHIdentityFileCollector)
    protected readonly identityFileCollector: SSHIdentityFileCollector;

    @inject(RemoteSetupService)
    protected readonly remoteSetup: RemoteSetupService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected passwordRetryCount = 3;
    protected passphraseRetryCount = 3;

    async matchSSHConfigHost(host: string, user?: string, customConfigFile?: string): Promise<Record<string, string | string[]> | undefined> {
        const sshConfig = await this.doGetSSHConfig(customConfigFile);
        const host2 = host.trim().split(':');

        const record = Object.fromEntries(
            Object.entries(sshConfig.compute(host2[0])).map(([k, v]) => [k.toLowerCase(), v])
        );

        // Generate a regexp to find wildcards and process the hostname with the wildcards
        if (record.host) {
            const checkHost = new RegExp('^' + (<string>record.host)
                .replace(/([^\w\*\?])/g, '\\$1')
                .replace(/([\?]+)/g, (...m) => '(' + '.'.repeat(m[1].length) + ')')
                .replace(/\*/g, '(.+)') + '$');

            const match = host2[0].match(checkHost);
            if (match) {
                if (record.hostname) {
                    record.hostname = (<string>record.hostname).replace('%h', match[1]);
                }
            }

            if (host2[1]) {
                record.port = host2[1];
            }
        }

        return record;
    }

    async getSSHConfig(customConfigFile?: string): Promise<SSHConfig> {
        return this.doGetSSHConfig(customConfigFile);
    }

    async doGetSSHConfig(customConfigFile?: string): Promise<SshConfig> {
        const empty = new SshConfig();
        if (!customConfigFile) {
            return empty;
        }
        try {
            const buff: Buffer = await fs.promises.readFile(customConfigFile);
            const sshConfig = SshConfig.parse(buff.toString());
            return sshConfig;
        } catch {
            return empty;
        }
    }

    async establishConnection(options: RemoteSSHConnectionProviderOptions): Promise<string> {
        const progress = await this.messageService.showProgress({
            text: 'Remote SSH'
        });
        const report: RemoteStatusReport = message => progress.report({ message });
        report('Connecting to remote system...');
        try {
            const remote = await this.establishSSHConnection(options.host, options.user, options.customConfigFile);
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
        } finally {
            progress.cancel();
        }
    }

    async establishSSHConnection(host: string, user: string, customConfigFile?: string): Promise<RemoteSSHConnection> {
        const deferred = new Deferred<RemoteSSHConnection>();
        const sshClient = new ssh2.Client();
        const sshHostConfig = await this.matchSSHConfigHost(host, user, customConfigFile);
        const identityFiles = await this.identityFileCollector.gatherIdentityFiles(undefined, <string[]>sshHostConfig?.identityfile);

        let algorithms: ssh2.Algorithms | undefined = undefined;
        if (sshHostConfig) {
            if (!user && sshHostConfig.user) {
                user = <string>sshHostConfig.user;
            }
            if (sshHostConfig.hostname) {
                host = sshHostConfig.hostname + ':' + (sshHostConfig.port || '22');
            } else if (sshHostConfig.port) {
                host = sshHostConfig.host + ':' + (sshHostConfig.port || '22');
            }
            if (sshHostConfig.compression && (<string>sshHostConfig.compression).toLowerCase() === 'yes') {
                algorithms = { compress: ['zlib@openssh.com', 'zlib'] };
            }
        }
        const hostUrl = new URL(`ssh://${host}`);
        const sshAuthHandler = this.getAuthHandler(user, hostUrl.hostname, identityFiles);
        sshClient
            .on('ready', async () => {
                const connection = new RemoteSSHConnection({
                    client: sshClient,
                    id: generateUuid(),
                    name: hostUrl.hostname,
                    type: 'SSH'
                });
                try {
                    await this.testConnection(connection);
                    deferred.resolve(connection);
                } catch (err) {
                    deferred.reject(err);
                }
            }).on('end', () => {
                console.log(`Ended remote connection to host '${user}@${hostUrl.hostname}'`);
            }).on('error', err => {
                deferred.reject(err);
            }).connect({
                host: hostUrl.hostname,
                port: hostUrl.port ? parseInt(hostUrl.port, 10) : undefined,
                username: user,
                algorithms: algorithms,
                authHandler: (methodsLeft, successes, callback) => (sshAuthHandler(methodsLeft, successes, callback), undefined)
            });
        return deferred.promise;
    }

    /**
     * Sometimes, ssh2.exec will not execute and retrieve any data right after the `ready` event fired.
     * In this method, we just perform `echo hello` in a loop to ensure that the connection is really ready.
     * See also https://github.com/mscdex/ssh2/issues/48
     */
    protected async testConnection(connection: RemoteSSHConnection): Promise<void> {
        for (let i = 0; i < 100; i++) {
            const result = await connection.exec('echo hello');
            if (result.stdout.includes('hello')) {
                return;
            }
            await timeout(50);
        }
        throw new Error('SSH connection failed testing. Could not execute "echo"');
    }

    protected getAuthHandler(user: string, host: string, identityKeys: SSHKey[]): ssh2.AuthHandlerMiddleware {
        let passwordRetryCount = this.passwordRetryCount;
        let keyboardRetryCount = this.passphraseRetryCount;
        // `false` is a valid return value, indicating that the authentication has failed
        const END_AUTH = false as unknown as ssh2.AuthenticationType;
        // `null` indicates that we just want to continue with the next auth type
        // eslint-disable-next-line no-null/no-null
        const NEXT_AUTH = null as unknown as ssh2.AuthenticationType;
        return async (methodsLeft: string[] | null, _partialSuccess: boolean | null, callback: ssh2.NextAuthHandler) => {
            if (!methodsLeft) {
                return callback({
                    type: 'none',
                    username: user,
                });
            }
            if (methodsLeft && methodsLeft.includes('publickey') && identityKeys.length) {
                const identityKey = identityKeys.shift()!;
                if (identityKey.isPrivate) {
                    return callback({
                        type: 'publickey',
                        username: user,
                        key: identityKey.parsedKey
                    });
                }
                if (!await fs.pathExists(identityKey.filename)) {
                    // Try next identity file
                    return callback(NEXT_AUTH);
                }

                const keyBuffer = await fs.promises.readFile(identityKey.filename);
                let result = ssh2.utils.parseKey(keyBuffer); // First try without passphrase
                if (result instanceof Error && result.message.match(/no passphrase given/)) {
                    let passphraseRetryCount = this.passphraseRetryCount;
                    while (result instanceof Error && passphraseRetryCount > 0) {
                        const passphrase = await this.quickInputService.input({
                            title: `Enter passphrase for ${identityKey.filename}`,
                            password: true
                        });
                        if (!passphrase) {
                            break;
                        }
                        result = ssh2.utils.parseKey(keyBuffer, passphrase);
                        passphraseRetryCount--;
                    }
                }
                if (!result || result instanceof Error) {
                    // Try next identity file
                    return callback(NEXT_AUTH);
                }

                const key = Array.isArray(result) ? result[0] : result;
                return callback({
                    type: 'publickey',
                    username: user,
                    key
                });
            }
            if (methodsLeft && methodsLeft.includes('password') && passwordRetryCount > 0) {
                const password = await this.quickInputService.input({
                    title: `Enter password for ${user}@${host}`,
                    password: true
                });
                passwordRetryCount--;

                return callback(password
                    ? {
                        type: 'password',
                        username: user,
                        password
                    }
                    : END_AUTH);
            }
            if (methodsLeft && methodsLeft.includes('keyboard-interactive') && keyboardRetryCount > 0) {
                return callback({
                    type: 'keyboard-interactive',
                    username: user,
                    prompt: async (_name, _instructions, _instructionsLang, prompts, finish) => {
                        const responses: string[] = [];
                        for (const prompt of prompts) {
                            const response = await this.quickInputService.input({
                                title: `(${user}@${host}) ${prompt.prompt}`,
                                password: !prompt.echo
                            });
                            if (response === undefined) {
                                keyboardRetryCount = 0;
                                break;
                            }
                            responses.push(response);
                        }
                        keyboardRetryCount--;
                        finish(responses);
                    }
                });
            }

            callback(END_AUTH);
        };
    }
}

export interface RemoteSSHConnectionOptions {
    id: string;
    name: string;
    type: string;
    client: ssh2.Client;
}

export class RemoteSSHConnection implements RemoteConnection {

    id: string;
    name: string;
    type: string;
    client: ssh2.Client;
    localPort = 0;
    remotePort = 0;

    private sftpClientPromise: Promise<SftpClient>;

    private readonly onDidDisconnectEmitter = new Emitter<void>();

    get onDidDisconnect(): Event<void> {
        return this.onDidDisconnectEmitter.event;
    }

    constructor(options: RemoteSSHConnectionOptions) {
        this.id = options.id;
        this.type = options.type;
        this.name = options.name;
        this.client = options.client;
        this.onDidDisconnect(() => this.dispose());
        this.client.on('end', () => {
            this.onDidDisconnectEmitter.fire();
        });
        this.sftpClientPromise = this.setupSftpClient();
    }

    protected async setupSftpClient(): Promise<SftpClient> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sftpClient = new SftpClient() as any;
        // A hack to set the internal ssh2 client of the sftp client
        // That way, we don't have to create a second connection
        sftpClient.client = this.client;
        // Calling this function establishes the sftp connection on the ssh client
        await sftpClient.getSftpChannel();
        return sftpClient;
    }

    forwardOut(socket: net.Socket, port?: number): void {
        this.client.forwardOut(socket.localAddress!, socket.localPort!, '127.0.0.1', port ?? this.remotePort, (err, stream) => {
            if (err) {
                console.debug('Proxy message rejected', err);
            } else {
                stream.pipe(socket).pipe(stream);
            }
        });
    }

    async copy(localPath: string, remotePath: string): Promise<void> {
        const sftpClient = await this.sftpClientPromise;
        await sftpClient.put(localPath, remotePath);
    }

    exec(cmd: string, args?: string[], options: RemoteExecOptions = {}): Promise<RemoteExecResult> {
        const deferred = new Deferred<RemoteExecResult>();
        cmd = this.buildCmd(cmd, args);
        this.client.exec(cmd, options, (err, stream) => {
            if (err) {
                return deferred.reject(err);
            }
            let stdout = '';
            let stderr = '';
            stream.on('close', () => {
                deferred.resolve({ stdout, stderr });
            }).on('data', (data: Buffer | string) => {
                stdout += data.toString();
            }).stderr.on('data', (data: Buffer | string) => {
                stderr += data.toString();
            });
        });
        return deferred.promise;
    }

    execPartial(cmd: string, tester: RemoteExecTester, args?: string[], options: RemoteExecOptions = {}): Promise<RemoteExecResult> {
        const deferred = new Deferred<RemoteExecResult>();
        cmd = this.buildCmd(cmd, args);
        this.client.exec(cmd, {
            ...options,
            // Ensure that the process on the remote ends when the connection is closed
            pty: true
        }, (err, stream) => {
            if (err) {
                return deferred.reject(err);
            }
            // in pty mode we only have an stdout stream
            // return stdout as stderr as well
            let stdout = '';
            stream.on('close', () => {
                if (deferred.state === 'unresolved') {
                    deferred.resolve({ stdout, stderr: stdout });
                }
            }).on('data', (data: Buffer | string) => {
                if (deferred.state === 'unresolved') {
                    stdout += data.toString();

                    if (tester(stdout, stdout)) {
                        deferred.resolve({ stdout, stderr: stdout });
                    }
                }
            });
        });
        return deferred.promise;
    }

    protected buildCmd(cmd: string, args?: string[]): string {
        const escapedArgs = args?.map(arg => `"${arg.replace(/"/g, '\\"')}"`) || [];
        const fullCmd = cmd + (escapedArgs.length > 0 ? (' ' + escapedArgs.join(' ')) : '');
        return fullCmd;
    }

    dispose(): void {
        this.client.end();
        this.client.destroy();
    }

}
