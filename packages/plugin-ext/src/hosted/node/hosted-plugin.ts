/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as path from 'path';
import * as cp from "child_process";
import { injectable, inject } from "inversify";
import { ILogger, ConnectionErrorHandler } from "@theia/core/lib/common";
import { Emitter } from '@theia/core/lib/common/event';
import { createIpcEnv } from "@theia/core/lib/node/messaging/ipc-protocol";
import { HostedPluginClient, PluginModel } from '../../common/plugin-protocol';
import { RPCProtocolImpl } from '../../api/rpc-protocol';
import { MAIN_RPC_CONTEXT } from '../../api/plugin-api';

export interface IPCConnectionOptions {
    readonly serverName: string;
    readonly logger: ILogger;
    readonly args: string[];
    readonly errorHandler?: ConnectionErrorHandler;
}

@injectable()
export class HostedPluginSupport {
    private client: HostedPluginClient;

    @inject(ILogger)
    protected readonly logger: ILogger;

    private cp: cp.ChildProcess | undefined;

    setClient(client: HostedPluginClient): void {
        this.client = client;
    }

    runPlugin(plugin: PluginModel): void {
        if (plugin.entryPoint.backend) {
            this.runPluginServer();
        }
    }

    onMessage(message: string): void {
        if (this.cp) {
            this.cp.send(message);
        }
    }

    clientClosed(): void {
        if (this.cp) {
            this.terminatePluginServer(this.cp);
            this.cp = undefined;
        }
    }

    private terminatePluginServer(childProcess: cp.ChildProcess) {
        const emitter = new Emitter();
        childProcess.on('message', message => {
            emitter.fire(JSON.parse(message));
        });
        const rpc = new RPCProtocolImpl({
            onMessage: emitter.event,
            send: (m: {}) => {
                if (childProcess.send) {
                    childProcess.send(JSON.stringify(m));
                }
            }
        });
        const hostedPluginManager = rpc.getProxy(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT);
        hostedPluginManager.$stopPlugin('').then(() => {
            childProcess.kill();
        });
    }

    public runPluginServer(): void {
        if (this.cp) {
            this.terminatePluginServer(this.cp);
        }
        this.cp = this.fork({
            serverName: "hosted-plugin",
            logger: this.logger,
            args: []
        });
        this.cp.on('message', message => {
            if (this.client) {
                this.client.postMessage(message);
            }
        });

    }

    private fork(options: IPCConnectionOptions): cp.ChildProcess {
        const forkOptions: cp.ForkOptions = {
            silent: true,
            env: createIpcEnv(),
            execArgv: [],
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        };
        const inspectArgPrefix = `--${options.serverName}-inspect`;
        const inspectArg = process.argv.find(v => v.startsWith(inspectArgPrefix));
        if (inspectArg !== undefined) {
            forkOptions.execArgv = ['--nolazy', `--inspect${inspectArg.substr(inspectArgPrefix.length)}`];
        }

        const childProcess = cp.fork(path.resolve(__dirname, 'plugin-host.js'), options.args, forkOptions);
        childProcess.stdout.on('data', data => this.logger.info(`[${options.serverName}: ${childProcess.pid}] ${data.toString()}`));
        childProcess.stderr.on('data', data => this.logger.error(`[${options.serverName}: ${childProcess.pid}] ${data.toString()}`));

        this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC started`);
        childProcess.once('exit', () => this.logger.debug(`[${options.serverName}: ${childProcess.pid}] IPC exited`));

        return childProcess;
    }
}
