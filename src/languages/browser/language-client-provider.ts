/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { WebSocketConnectionProvider } from "../../messaging/browser";
import {
    BaseLanguageClient,
    LanguageClientOptions,
    ConnectionCloseHandler,
    ConnectionErrorHandler,
    createConnection,
    ILanguageClient,
    Languages,
    OutputChannel,
    Window,
    Workspace,
    Commands,
    LanguageIdentifier,
    FileSystemWatcher
} from '../common';
import { CompositeLanguageClientContribution } from './language-client-contribution';

export const LanguageClientProvider = Symbol('LanguageClientProvider');
export type LanguageClientProvider = (language: LanguageIdentifier) => Promise<ILanguageClient>;

@injectable()
export class DefaultLanguageClientProvider {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(Commands) protected readonly commands: Commands,
        @inject(Window) protected readonly window: Window,
        @inject(WebSocketConnectionProvider) protected readonly connectionProvider: WebSocketConnectionProvider,
        @inject(CompositeLanguageClientContribution) protected readonly contribution: CompositeLanguageClientContribution
    ) { }

    get(identifier: LanguageIdentifier): Promise<ILanguageClient> {
        return this.createOptions(identifier).then(options =>
            this.create(identifier, options)
        );
    }

    create(identifier: LanguageIdentifier, clientOptions: LanguageClientOptions): ILanguageClient {
        const { workspace, languages, commands, window } = this;
        const language = identifier.description;
        return new BaseLanguageClient({
            name: `${language.name || language.id} Language Client`,
            clientOptions,
            services: { workspace, languages, commands, window },
            connectionProvider: {
                // FIXME get rid of outputChannel
                get: (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler, outputChannel: OutputChannel | undefined) =>
                    new Promise(resolve => {
                        this.connectionProvider.listen({
                            path: identifier.path,
                            onConnection: messageConnection => {
                                const connection = createConnection(messageConnection, errorHandler, closeHandler);
                                resolve(connection);
                            }
                        }, { reconnecting: false })
                    })
            }
        });
    }

    createOptions(
        identifier: LanguageIdentifier,
        initial: Promise<LanguageClientOptions> = this.createInitialOptions(identifier)
    ): Promise<LanguageClientOptions> {
        return this.contribution.createOptions(identifier, initial);
    }

    createInitialOptions(identifier: LanguageIdentifier): Promise<LanguageClientOptions> {
        return this.createFileEvents(identifier).then(fileEvents => {
            return {
                documentSelector: identifier.description.documentSelector,
                synchronize: { fileEvents }
            };
        });
    }

    createFileEvents(identifier: LanguageIdentifier): Promise<FileSystemWatcher[]> {
        return this.workspace.ready.then(() => {
            const watchers = [];
            if (this.workspace.createFileSystemWatcher && identifier.description.fileEvents) {
                for (const fileEvent of identifier.description.fileEvents) {
                    if (typeof fileEvent === 'string') {
                        watchers.push(this.workspace.createFileSystemWatcher(fileEvent));
                    } else {
                        watchers.push(this.workspace.createFileSystemWatcher(
                            fileEvent.globPattern,
                            fileEvent.ignoreCreateEvents,
                            fileEvent.ignoreChangeEvents,
                            fileEvent.ignoreDeleteEvents
                        ));
                    }
                }
            }
            return watchers;
        })
    }

}
