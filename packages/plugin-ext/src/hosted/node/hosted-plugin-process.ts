// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as cp from 'child_process';
import { injectable, inject, named } from '@theia/core/shared/inversify';
import { ILogger, ContributionProvider, MessageService, AnyConnection } from '@theia/core/lib/common';
import { ObjectStreamConnection } from '@theia/core/lib/node/connection/object-stream';
import { createIpcEnv } from '@theia/core/lib/node/messaging/ipc-protocol';
import { HostedPluginClient, ServerPluginRunner, PluginHostEnvironmentVariable, DeployedPlugin, PLUGIN_HOST_BACKEND } from '../../common/plugin-protocol';
import { PluginHostProtocol } from '../../common/rpc-protocol';
import { HostedPluginCliContribution } from './hosted-plugin-cli-contribution';
import * as psTree from 'ps-tree';
import { HostedPluginLocalizationService } from './hosted-plugin-localization-service';
import { createInterface } from 'readline';
import { PackrStream, UnpackrStream } from '@theia/core/shared/msgpackr';
import { Duplex } from 'stream';

export const HOSTED_PLUGIN_ENV_PREFIX = 'HOSTED_PLUGIN';

export interface IPCConnectionOptions {
    readonly serverName: string;
    readonly logger: ILogger;
    readonly args: string[];
}

export const HostedPluginProcessConfiguration = Symbol('HostedPluginProcessConfiguration');
export interface HostedPluginProcessConfiguration {
    readonly path: string
}

@injectable()
export class HostedPluginProcess implements ServerPluginRunner {

    @inject(HostedPluginProcessConfiguration)
    protected configuration: HostedPluginProcessConfiguration;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginCliContribution)
    protected readonly cli: HostedPluginCliContribution;

    @inject(ContributionProvider)
    @named(PluginHostEnvironmentVariable)
    protected readonly pluginHostEnvironmentVariables: ContributionProvider<PluginHostEnvironmentVariable>;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(HostedPluginLocalizationService)
    protected readonly localizationService: HostedPluginLocalizationService;

    private childProcess?: cp.ChildProcess;
    private childConnection: AnyConnection;
    private client?: HostedPluginClient;

    private terminatingPluginServer = false;

    public setClient(client: HostedPluginClient): void {
        if (this.client) {
            if (this.childProcess) {
                this.runPluginServer();
            }
        }
        this.client = client;
    }

    public clientClosed(): void {

    }

    public setDefault(defaultRunner: ServerPluginRunner): void {

    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public acceptMessage(pluginHostId: string, message: any): boolean {
        return pluginHostId === 'main';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public handleMessage(pluginHostId: string, message: any): void {
        this.childConnection?.sendMessage(message);
    }

    async terminatePluginServer(): Promise<void> {
        if (this.childProcess === undefined) {
            return;
        }

        this.terminatingPluginServer = true;
        const pluginHost = this.childProcess;
        this.childProcess = undefined;

        const stopTimeout = this.cli.pluginHostStopTimeout;
        const terminateTimeout = this.cli.pluginHostTerminateTimeout;

        const waitForTerminated = new Promise<void>(resolve => {
            pluginHost.on('message', message => {
                if (PluginHostProtocol.isMessage(message) && message.$pluginHostMessageType === PluginHostProtocol.MessageType.TERMINATED_EVENT) {
                    resolve();
                }
            });
            if (terminateTimeout) {
                setTimeout(resolve, terminateTimeout);
            }
        });

        pluginHost.send(new PluginHostProtocol.TerminateRequest(stopTimeout));

        await waitForTerminated;

        this.killProcessTree(pluginHost.pid);
    }

    killProcessTree(parentPid: number): void {
        psTree(parentPid, (_, childProcesses) => {
            childProcesses.forEach(childProcess =>
                this.killProcess(parseInt(childProcess.PID))
            );
            this.killProcess(parentPid);
        });
    }

    protected killProcess(pid: number): void {
        try {
            process.kill(pid);
        } catch (e) {
            if (e && 'code' in e && e.code === 'ESRCH') {
                return;
            }
            this.logger.error(`[${pid}] failed to kill`, e);
        }
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
        this.childConnection = this.createChildConnection(this.childProcess);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.childConnection.onMessage((message: any) => {
            this.client?.postMessage(PLUGIN_HOST_BACKEND, message);
        });
    }

    private createChildConnection(child: cp.ChildProcess): AnyConnection {
        const duplex = child.stdio[4] as Duplex;
        const reader = new UnpackrStream();
        const writer = new PackrStream();
        duplex.pipe(reader);
        writer.pipe(duplex);
        return new ObjectStreamConnection(reader, writer);
    }

    private fork(options: IPCConnectionOptions): cp.ChildProcess {

        // create env and add PATH to it so any executable from root process is available
        const env = createIpcEnv(process.env)!;
        for (const key of Object.keys(env)) {
            if (key.startsWith(HOSTED_PLUGIN_ENV_PREFIX)) {
                delete env[key];
            }
        }
        env['VSCODE_NLS_CONFIG'] = JSON.stringify(this.localizationService.getNlsConfig());
        // apply external env variables
        this.pluginHostEnvironmentVariables.getContributions().forEach(envVar => envVar.process(env));
        if (this.cli.extensionTestsPath) {
            env.extensionTestsPath = this.cli.extensionTestsPath;
        }

        const forkOptions: cp.ForkOptions = {
            silent: true,
            env: env,
            execArgv: [],
            stdio: ['pipe', 'pipe', 'pipe', 'ipc', 'pipe' /* fd=4 */]
        };
        const inspectArgPrefix = `--${options.serverName}-inspect`;
        const inspectArg = process.argv.find(v => v.startsWith(inspectArgPrefix));
        if (inspectArg !== undefined) {
            forkOptions.execArgv = ['--nolazy', `--inspect${inspectArg.substring(inspectArgPrefix.length)}`];
        }

        const childProcess = cp.fork(this.configuration.path, options.args, forkOptions);
        createInterface(childProcess.stdout!).on('line', line => this.logger.info(`[${options.serverName}: ${childProcess.pid}] ${line}`));
        createInterface(childProcess.stderr!).on('line', line => this.logger.error(`[${options.serverName}: ${childProcess.pid}] ${line}`));

        this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC started`);
        childProcess.once('exit', (code: number, signal: string) => this.handleChildProcessExit(options.serverName, childProcess.pid, code, signal));
        childProcess.on('error', err => this.handleChildProcessError(err));
        return childProcess;
    }

    private handleChildProcessExit(serverName: string, pid: number, code: number, signal: string): void {
        if (this.terminatingPluginServer) {
            return;
        }
        this.logger.error(`[${serverName}: ${pid}] IPC exited, with signal: ${signal}, and exit code: ${code}`);

        const message = 'Plugin runtime crashed unexpectedly, all plugins are not working, please reload the page.';
        let hintMessage: string = 'If it doesn\'t help, please check Theia server logs.';
        if (signal?.toUpperCase() === 'SIGKILL') {
            // May happen in case of OOM or manual force stop.
            hintMessage = 'Probably there is not enough memory for the plugins. ' + hintMessage;
        }

        this.messageService.error(message + ' ' + hintMessage, { timeout: 15 * 60 * 1000 });
    }

    private handleChildProcessError(err: Error): void {
        this.logger.error(`Error from plugin host: ${err.message}`);
    }

    /**
     * Provides additional plugin ids.
     */
    public async getExtraDeployedPluginIds(): Promise<string[]> {
        return [];
    }

    /**
     * Provides additional deployed plugins.
     */
    public async getExtraDeployedPlugins(): Promise<DeployedPlugin[]> {
        return [];
    }
}
