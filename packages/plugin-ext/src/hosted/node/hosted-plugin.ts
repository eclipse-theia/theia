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

import { injectable, inject, multiInject, postConstruct, optional } from '@theia/core/shared/inversify';
import { ILogger, ConnectionErrorHandler } from '@theia/core/lib/common';
import { HostedPluginClient, PluginModel, ServerPluginRunner, DeployedPlugin } from '../../common/plugin-protocol';
import { LogPart } from '../../common/types';
import { HostedPluginProcess } from './hosted-plugin-process';

export interface IPCConnectionOptions {
    readonly serverName: string;
    readonly logger: ILogger;
    readonly args: string[];
    readonly errorHandler?: ConnectionErrorHandler;
}

@injectable()
export class HostedPluginSupport {
    private isPluginProcessRunning = false;
    private client: HostedPluginClient;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginProcess)
    protected readonly hostedPluginProcess: HostedPluginProcess;

    /**
     * Optional runners to delegate some work
     */
    @optional()
    @multiInject(ServerPluginRunner)
    private readonly pluginRunners: ServerPluginRunner[];

    @postConstruct()
    protected init(): void {
        this.pluginRunners.forEach(runner => {
            runner.setDefault(this.hostedPluginProcess);
        });
    }

    setClient(client: HostedPluginClient): void {
        this.client = client;
        this.hostedPluginProcess.setClient(client);
        this.pluginRunners.forEach(runner => runner.setClient(client));
    }

    clientClosed(): void {
        this.isPluginProcessRunning = false;
        this.terminatePluginServer();
        this.isPluginProcessRunning = false;
        this.pluginRunners.forEach(runner => runner.clientClosed());
    }

    runPlugin(plugin: PluginModel): void {
        if (!plugin.entryPoint.frontend) {
            this.runPluginServer();
        }
    }

    onMessage(message: string): void {
        // need to perform routing
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsonMessage: any = JSON.parse(message);
        if (this.pluginRunners.length > 0) {
            this.pluginRunners.forEach(runner => {
                if (runner.acceptMessage(jsonMessage)) {
                    runner.onMessage(jsonMessage);
                }
            });
        } else {
            this.hostedPluginProcess.onMessage(jsonMessage.content);
        }
    }

    runPluginServer(): void {
        if (!this.isPluginProcessRunning) {
            this.hostedPluginProcess.runPluginServer();
            this.isPluginProcessRunning = true;
        }
    }

    /**
     * Provides additional plugin ids.
     */
    async getExtraDeployedPluginIds(): Promise<string[]> {
        return [].concat.apply([], await Promise.all(this.pluginRunners.map(runner => runner.getExtraDeployedPluginIds())));
    }

    /**
     * Provides additional deployed plugins.
     */
    async getExtraDeployedPlugins(): Promise<DeployedPlugin[]> {
        return [].concat.apply([], await Promise.all(this.pluginRunners.map(runner => runner.getExtraDeployedPlugins())));
    }

    sendLog(logPart: LogPart): void {
        this.client.log(logPart);
    }

    private terminatePluginServer(): void {
        this.hostedPluginProcess.terminatePluginServer();
    }
}
