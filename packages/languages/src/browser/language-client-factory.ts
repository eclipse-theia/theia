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

import { injectable, inject } from "inversify";
import { WebSocketConnectionProvider } from "@theia/core/lib/browser";
import { ErrorAction } from "vscode-base-languageclient/lib/base";
import {
    Workspace, Languages, Window,
    ILanguageClient, LanguageClientOptions, BaseLanguageClient,
    createConnection, ConnectionErrorHandler, ConnectionCloseHandler, LanguageContribution
} from '../common';

@injectable()
export class LanguageClientFactory {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(Window) protected readonly window: Window,
        @inject(WebSocketConnectionProvider) protected readonly connectionProvider: WebSocketConnectionProvider
    ) { }

    get(contribution: LanguageContribution, clientOptions: LanguageClientOptions): ILanguageClient {
        const { workspace, languages, window } = this;
        const commands = clientOptions.commands;
        const services = { workspace, languages, commands, window };
        if (!clientOptions.errorHandler) {
            clientOptions.errorHandler = {
                // ignore connection errors
                error: () => ErrorAction.Continue,
                closed: () => defaultErrorHandler.closed()
            };
        }
        const client = new BaseLanguageClient({
            name: contribution.name,
            clientOptions,
            services,
            connectionProvider: {
                get: (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler) =>
                    new Promise(resolve => {
                        this.connectionProvider.listen({
                            path: LanguageContribution.getPath(contribution),
                            onConnection: messageConnection => {
                                const connection = createConnection(messageConnection, errorHandler, closeHandler);
                                resolve(connection);
                            },
                        },
                            { reconnecting: false }
                        );
                    })
            }
        });
        const defaultErrorHandler = client.createDefaultErrorHandler();
        return client;
    }

}
