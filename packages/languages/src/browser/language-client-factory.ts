/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { WebSocketConnectionProvider } from "@theia/core/lib/browser";
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
        return new BaseLanguageClient({
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
                            }
                        },
                            { reconnecting: false }
                        );
                    })
            }
        });
    }

}
