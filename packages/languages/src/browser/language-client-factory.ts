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

    // tslint:disable-next-line:no-any
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
        return new MonacoLanguageClient({
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
    }

}
