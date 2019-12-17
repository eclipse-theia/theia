/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import * as glob from 'glob';
import { Socket } from 'net';
import { injectable, inject, named } from 'inversify';
import { Message, isRequestMessage } from 'vscode-ws-jsonrpc';
import { InitializeParams, InitializeRequest } from 'vscode-languageserver-protocol';
import { createSocketConnection } from 'vscode-ws-jsonrpc/lib/server';
import { DEBUG_MODE } from '@theia/core/lib/node';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { IConnection, BaseLanguageServerContribution, LanguageServerStartOptions } from '@theia/languages/lib/node';
import { JAVA_LANGUAGE_ID, JAVA_LANGUAGE_NAME, JavaStartParams } from '../common';
import { JavaCliContribution } from './java-cli-contribution';
import { ContributionProvider } from '@theia/core';
import { JavaExtensionContribution } from './java-extension-model';
import { AddressInfo } from 'net';
const sha1 = require('sha1');

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();
configurations.set('darwin', 'config_mac');
configurations.set('win32', 'config_win');
configurations.set('linux', 'config_linux');

export interface JavaStartOptions extends LanguageServerStartOptions {
    parameters?: JavaStartParams
}

@injectable()
export class JavaContribution extends BaseLanguageServerContribution {

    readonly id = JAVA_LANGUAGE_ID;
    readonly name = JAVA_LANGUAGE_NAME;

    private activeDataFolders: Set<string>;
    private javaBundles: string[] = [];
    protected readonly ready: Promise<void>;

    constructor(
        @inject(EnvVariablesServer) protected readonly envServer: EnvVariablesServer,
        @inject(JavaCliContribution) protected readonly cli: JavaCliContribution,
        @inject(ContributionProvider) @named(JavaExtensionContribution)
        protected readonly contributions: ContributionProvider<JavaExtensionContribution>
    ) {
        super();
        this.activeDataFolders = new Set<string>();
        this.ready = this.collectExtensionBundles();
    }

    protected async collectExtensionBundles(): Promise<void> {
        for (const contrib of this.contributions.getContributions()) {
            try {
                const javaBundles = await contrib.getExtensionBundles();
                this.javaBundles = this.javaBundles.concat(javaBundles);
            } catch (e) {
                console.error(e);
            }
        }
    }

    async start(clientConnection: IConnection, { parameters }: JavaStartOptions): Promise<void> {
        await this.ready;

        const socketPort = this.cli.lsPort();
        // Only if the JDT LS has been started in debug mode.
        if (socketPort) {
            const debugSocket = new Socket();
            const debugConnection = createSocketConnection(debugSocket, debugSocket, () => debugSocket.destroy());
            this.forward(clientConnection, debugConnection);
            debugSocket.connect(socketPort);
            return;
        }

        const serverPath = path.resolve(__dirname, '..', '..', 'server');
        const jarPaths = glob.sync('**/plugins/org.eclipse.equinox.launcher_*.jar', { cwd: serverPath });
        if (jarPaths.length === 0) {
            throw new Error('The Java server launcher is not found.');
        }
        const jarPath = path.resolve(serverPath, jarPaths[0]);

        let workspaceUri: string;
        if (!parameters || !parameters.workspace) {
            workspaceUri = 'default';
        } else {
            workspaceUri = parameters.workspace;
        }

        const dataFolderSuffix = this.generateDataFolderSuffix(workspaceUri);
        this.activeDataFolders.add(dataFolderSuffix);
        clientConnection.onClose(() => this.activeDataFolders.delete(dataFolderSuffix));

        const workspacePath = path.resolve(await this.envServer.getUserDataFolderPath(), 'jdt.ls', '_ws_' + dataFolderSuffix);
        const configuration = configurations.get(process.platform);
        if (!configuration) {
            throw new Error('Cannot find Java server configuration for ' + process.platform);
        }
        const configurationPath = path.resolve(serverPath, configuration);
        const command = 'java';
        const args: string[] = [];

        if (parameters && parameters.jvmArgs) {
            parameters.jvmArgs.map(jvmArg => args.push(jvmArg));
        }

        if (DEBUG_MODE) {
            args.push('-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=1044');
        }

        args.push(...[
            '-Declipse.application=org.eclipse.jdt.ls.core.id1',
            '-Dosgi.bundles.defaultStartLevel=4',
            '-Declipse.product=org.eclipse.jdt.ls.core.product'
        ]);

        if (DEBUG_MODE) {
            args.push('-Dlog.level=ALL');
        }

        args.push(
            '-jar', jarPath,
            '-configuration', configurationPath,
            '-data', workspacePath
        );

        const server = await this.startSocketServer();
        const socket = this.accept(server);

        this.logInfo('logs at ' + path.resolve(workspacePath, '.metadata', '.log'));
        const env = Object.create(process.env);
        const address = server.address();
        env.CLIENT_HOST = (address as AddressInfo).address;
        env.CLIENT_PORT = (address as AddressInfo).port;
        const serverConnection = await this.createProcessSocketConnection(socket, socket, command, args, { env });
        this.forward(clientConnection, serverConnection);
    }

    protected generateDataFolderSuffix(workspaceUri: string): string {
        const shaValue = sha1(workspaceUri);
        let instanceCounter = 0;
        let dataFolderName = shaValue + '_' + instanceCounter;
        while (this.activeDataFolders.has(dataFolderName)) {
            instanceCounter++;
            dataFolderName = shaValue + '_' + instanceCounter;
        }
        return dataFolderName;
    }

    protected map(message: Message): Message {
        if (isRequestMessage(message)) {
            if (message.method === InitializeRequest.type.method) {
                const initializeParams = message.params as InitializeParams;
                const initializeOptions = initializeParams.initializationOptions;
                initializeOptions.bundles = this.javaBundles;
            }
        }
        return super.map(message);
    }
}
