/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import {
    Workspace, Languages, Commands, Window,
    ILanguageClient, LanguageClientOptions, BaseLanguageClient,
    createConnection, ConnectionErrorHandler, ConnectionCloseHandler
} from '../common';
import { WebSocketConnectionProvider } from "../../messaging/browser";
import { LanguageContribution } from "./language-client-contribution";

@injectable()
export class LanguageClientFactory {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(Commands) protected readonly commands: Commands,
        @inject(Window) protected readonly window: Window,
        @inject(WebSocketConnectionProvider) protected readonly connectionProvider: WebSocketConnectionProvider
    ) { }

    get(contribution: LanguageContribution, clientOptions: LanguageClientOptions): ILanguageClient {
        const { workspace, languages, commands, window } = this;
        const services = { workspace, languages, commands, window }
        return new BaseLanguageClient({
            name: contribution.id,
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
                        )
                    })
            }
        });
    }

}