/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as path from 'path';
import * as cp from 'child_process';
import { injectable, inject, named } from 'inversify';
import { ILogger, ConnectionErrorHandler, ContributionProvider, MessageService } from '@theia/core/lib/common';
import { Emitter } from '@theia/core/lib/common/event';
import { createIpcEnv } from '@theia/core/lib/node/messaging/ipc-protocol';
import { HostedPluginClient, ServerPluginRunner, PluginMetadata, PluginHostEnvironmentVariable } from '../../common/plugin-protocol';
import { RPCProtocolImpl } from '../../common/rpc-protocol';
import { MAIN_RPC_CONTEXT } from '../../common/plugin-api-rpc';
import { HostedPluginCliContribution } from './hosted-plugin-cli-contribution';
import { HostedPluginProcessesCache } from './hosted-plugin-processes-cache';
import * as psTree from 'ps-tree';

export interface IPCConnectionOptions {
    readonly serverName: string;
    readonly logger: ILogger;
    readonly args: string[];
    readonly errorHandler?: ConnectionErrorHandler;
}

@injectable()
export class HostedPluginProcess implements ServerPluginRunner {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginCliContribution)
    protected readonly cli: HostedPluginCliContribution;

    @inject(HostedPluginProcessesCache)
    protected readonly pluginProcessCache: HostedPluginProcessesCache;

    @inject(ContributionProvider)
    @named(PluginHostEnvironmentVariable)
    protected readonly pluginHostEnvironmentVariables: ContributionProvider<PluginHostEnvironmentVariable>;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    private childProcess: cp.ChildProcess | undefined;

    private client: HostedPluginClient;

    private terminatingPluginServer = false;

    private async getClientId(): Promise<number> {
        return await this.pluginProcessCache.getLazyClientId(this.client);
    }

    public setClient(client: HostedPluginClient): void {
        if (this.client) {
            if (this.childProcess) {
                this.runPluginServer();
            }
        }
        this.client = client;
        this.getClientId().then(clientId => {
            const childProcess = this.pluginProcessCache.retrieveClientChildProcess(clientId);
            if (!this.childProcess && childProcess) {
                this.childProcess = childProcess;
                this.linkClientWithChildProcess(this.childProcess);
            }
        });
    }

    public clientClosed(): void {

    }

    public setDefault(defaultRunner: ServerPluginRunner): void {

    }

    // tslint:disable-next-line:no-any
    public acceptMessage(jsonMessage: any): boolean {
        return jsonMessage.type !== undefined && jsonMessage.id;
    }

    // tslint:disable-next-line:no-any
    public onMessage(jsonMessage: any): void {
        if (this.childProcess) {
            this.childProcess.send(JSON.stringify(jsonMessage));
        }
    }

    public markPluginServerTerminated(): void {
        if (this.childProcess) {
            this.pluginProcessCache.scheduleChildProcessTermination(this, this.childProcess);
        }
    }

    public terminatePluginServer(): void {
        if (this.childProcess === undefined) {
            return;
        }

        this.terminatingPluginServer = true;
        // tslint:disable-next-line:no-shadowed-variable
        const cp = this.childProcess;
        this.childProcess = undefined;

        const emitter = new Emitter<{}>();
        cp.on('message', message => {
            emitter.fire(JSON.parse(message));
        });
        const rpc = new RPCProtocolImpl({
            onMessage: emitter.event,
            send: (m: {}) => {
                if (cp.send) {
                    cp.send(JSON.stringify(m));
                }
            }
        });
        const hostedPluginManager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
        hostedPluginManager.$stopPlugin('').then(() => {
            emitter.dispose();
            this.killProcessTree(cp.pid);
        });
    }

    private killProcessTree(parentPid: number): void {
        psTree(parentPid, (err: Error, childProcesses: Array<psTree.PS>) => {
            childProcesses.forEach((p: psTree.PS) => {
                process.kill(parseInt(p.PID));
            });
            process.kill(parentPid);
        });
    }

    public runPluginServer(): void {
        if (this.childProcess) {
            this.terminatePluginServer();
        }
        this.terminatingPluginServer = false;
        this.childProcess = this.fork({
            serverName: 'hosted-plugin',
            logger: this.logger,
            args: []
        });
        this.linkClientWithChildProcess(this.childProcess);

    }

    private linkClientWithChildProcess(childProcess: cp.ChildProcess): void {
        childProcess.on('message', message => {
            if (this.client) {
                this.client.postMessage(message);
            }
        });
        this.getClientId().then(clientId => {
            this.pluginProcessCache.linkLiveClientAndProcess(clientId, childProcess);
        });
    }

    readonly HOSTED_PLUGIN_ENV_REGEXP_EXCLUSION = new RegExp('HOSTED_PLUGIN*');
    private fork(options: IPCConnectionOptions): cp.ChildProcess {

        // create env and add PATH to it so any executable from root process is available
        const env = createIpcEnv({ env: process.env });
        for (const key of Object.keys(env)) {
            if (this.HOSTED_PLUGIN_ENV_REGEXP_EXCLUSION.test(key)) {
                delete env[key];
            }
        }
        // apply external env variables
        this.pluginHostEnvironmentVariables.getContributions().forEach(envVar => envVar.process(env));
        if (this.cli.extensionTestsPath) {
            env.extensionTestsPath = this.cli.extensionTestsPath;
        }

        const forkOptions: cp.ForkOptions = {
            silent: true,
            env: env,
            execArgv: [],
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        };
        const inspectArgPrefix = `--${options.serverName}-inspect`;
        const inspectArg = process.argv.find(v => v.startsWith(inspectArgPrefix));
        if (inspectArg !== undefined) {
            forkOptions.execArgv = ['--nolazy', `--inspect${inspectArg.substr(inspectArgPrefix.length)}`];
        }

        const childProcess = cp.fork(path.resolve(__dirname, 'plugin-host.js'), options.args, forkOptions);
        childProcess.stdout.on('data', data => this.logger.info(`[${options.serverName}: ${childProcess.pid}] ${data.toString().trim()}`));
        childProcess.stderr.on('data', data => this.logger.error(`[${options.serverName}: ${childProcess.pid}] ${data.toString().trim()}`));

        this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC started`);
        childProcess.once('exit', (code: number, signal: string) => this.onChildProcessExit(options.serverName, childProcess.pid, code, signal));
        childProcess.on('error', err => this.onChildProcessError(err));
        return childProcess;
    }

    private onChildProcessExit(serverName: string, pid: number, code: number, signal: string): void {
        if (this.terminatingPluginServer) {
            return;
        }
        this.logger.error(`[${serverName}: ${pid}] IPC exited, with signal: ${signal}, and exit code: ${code}`);
        this.messageService.error('Plugin runtime crashed unexpectedly, all plugins are not working, please reload...', { timeout: 15 * 60 * 1000 });
    }

    private onChildProcessError(err: Error): void {
        this.logger.error(`Error from plugin host: ${err.message}`);
    }

    async getExtraPluginMetadata(): Promise<PluginMetadata[]> {
        return [];
    }

}
