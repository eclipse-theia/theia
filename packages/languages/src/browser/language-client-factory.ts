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

import { injectable, inject } from 'inversify';
import { MessageConnection } from 'vscode-jsonrpc';
import { CommandRegistry, Disposable, MaybePromise } from '@theia/core/lib/common';
import { ErrorAction, RevealOutputChannelOn, CloseAction } from 'monaco-languageclient';
import {
    Workspace, Languages, Window, Services,
    ILanguageClient, LanguageClientOptions, MonacoLanguageClient,
    createConnection, LanguageContribution
} from './language-client-services';
import { TypeHierarchyFeature } from './typehierarchy/typehierarchy-feature';

@injectable()
export class LanguageClientFactory {

    @inject(CommandRegistry) protected readonly registry: CommandRegistry;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(Window) protected readonly window: Window
    ) {
        Services.install({
            workspace,
            languages,
            window,
            commands: {
                registerCommand: this.registerCommand.bind(this)
            }
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected registerCommand(id: string, callback: (...args: any[]) => any, thisArg?: any): Disposable {
        const execute = callback.bind(thisArg);
        return this.registry.registerCommand({ id }, { execute });
    }

    get(contribution: LanguageContribution, clientOptions: LanguageClientOptions,
        connectionProvider: MessageConnection | (() => MaybePromise<MessageConnection>)): ILanguageClient {
        if (clientOptions.revealOutputChannelOn === undefined) {
            clientOptions.revealOutputChannelOn = RevealOutputChannelOn.Never;
        }
        if (!clientOptions.errorHandler) {
            clientOptions.errorHandler = {
                // ignore connection errors
                error: () => ErrorAction.Continue,
                closed: () => CloseAction.DoNotRestart
            };
        }
        const initializationFailedHandler = clientOptions.initializationFailedHandler;
        clientOptions.initializationFailedHandler = e => !!initializationFailedHandler && initializationFailedHandler(e);
        const client = new MonacoLanguageClient({
            id: contribution.id,
            name: contribution.name,
            clientOptions,
            connectionProvider: {
                get: async (errorHandler, closeHandler) => {
                    const connection = typeof connectionProvider === 'function' ? await connectionProvider() : connectionProvider;
                    return createConnection(connection, errorHandler, closeHandler);
                }
            }
        });
        client.registerFeature(new TypeHierarchyFeature(client));
        return this.patch4085(client);
    }

    /**
     * see https://github.com/eclipse-theia/theia/issues/4085
     * remove when monaco-languageclient is upgraded to latest vscode-languageclient
     */
    protected patch4085(client: MonacoLanguageClient): MonacoLanguageClient {
        const features = client['_dynamicFeatures'] as Map<string, {
            _listener?: Object | undefined
            dispose?: Function
        }>;
        for (const feature of features.values()) {
            if (feature.dispose) {
                const dispose = feature.dispose.bind(feature);
                feature.dispose = () => {
                    dispose();
                    if (feature._listener) {
                        feature._listener = undefined;
                    }
                };
            }
        }
        return client;
    }

}
