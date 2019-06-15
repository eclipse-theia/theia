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

import { injectable, postConstruct, inject } from 'inversify';
import *  as path from 'path';
import { ApplicationPackage, environment } from '@theia/application-package';
import { BaseLanguageServerContribution, IConnection, LanguageServerStartOptions } from '@theia/languages/lib/node';
import { TYPESCRIPT_LANGUAGE_ID, TYPESCRIPT_LANGUAGE_NAME, TypescriptStartParams } from '../common';
import { TypeScriptPlugin, TypeScriptInitializeParams, TypeScriptInitializationOptions } from 'typescript-language-server/lib/ts-protocol';
import { isRequestMessage, Message } from 'vscode-ws-jsonrpc';
import { InitializeRequest } from 'vscode-languageserver-protocol';
import { TypescriptVersionURI } from './typescript-version-service-impl';

export interface TypeScriptStartOptions extends LanguageServerStartOptions {
    parameters?: TypescriptStartParams
}

@injectable()
export class TypeScriptContribution extends BaseLanguageServerContribution {

    readonly id = TYPESCRIPT_LANGUAGE_ID;
    readonly name = TYPESCRIPT_LANGUAGE_NAME;

    protected readonly plugins: TypeScriptPlugin[] = [];

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    @postConstruct()
    protected init(): void {
        for (const extension of this.applicationPackage.extensionPackages) {
            const { contributes, installed } = extension.raw;
            if (installed && contributes && contributes.typescriptServerPlugins && Array.isArray(contributes.typescriptServerPlugins)) {
                for (const plugin of contributes.typescriptServerPlugins) {
                    this.plugins.push({
                        name: plugin.name,
                        location: installed.packagePath
                    });
                }
            }
        }
    }

    async start(clientConnection: IConnection, { parameters }: TypeScriptStartOptions): Promise<void> {
        // Re-use the same tool used to launch Theia. e.g. for an Electron Theia packaging,
        // this will be "electron" executable that is bundled with the application.
        const command = process.execPath;
        const args: string[] = [
            path.join(__dirname, 'startserver.js'),
            '--stdio'
        ];
        const tsServerPath = TypescriptVersionURI.getTsServerPath(parameters && parameters.version);
        if (tsServerPath) {
            args.push(`--tsserver-path=${tsServerPath}`);
        }
        const serverConnection = await this.createProcessStreamConnectionAsync(command, args, { env: environment.electron.runAsNodeEnv() });
        this.forward(clientConnection, serverConnection);
    }

    protected map(message: Message): Message {
        if (isRequestMessage(message)) {
            if (message.method === InitializeRequest.type.method) {
                const initializeParams = message.params as TypeScriptInitializeParams;
                if (this.plugins.length) {
                    const options: TypeScriptInitializationOptions = {
                        plugins: [],
                        ...initializeParams.initializationOptions
                    };
                    options.plugins.push(...this.plugins);
                    initializeParams.initializationOptions = options;
                }
            }
        }
        return super.map(message);
    }

}
