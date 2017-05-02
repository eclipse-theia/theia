/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, injectable, inject, optional } from "inversify";
import { TheiaPlugin, TheiaApplication } from "../../application/browser";
import { WebSocketConnectionProvider } from "../../messaging/browser";
import {
    BaseLanguageClient,
    Commands,
    ConnectionCloseHandler,
    ConnectionErrorHandler,
    createConnection,
    ILanguageClient,
    Languages,
    OutputChannel,
    Window,
    Workspace,
    ConsoleWindow,
    LanguageIdentifier,
    LanguageDescription,
    FileSystemWatcher,
    LanguagesService,
    LANGUAGES_PATH
} from '../common';

export const browserLanguagesModule = new ContainerModule(bind => {
    bind(Window).to(ConsoleWindow).inSingletonScope();
    bind(TheiaPlugin).to(LanguagesPlugin).inSingletonScope();

    bind<LanguagesService>(LanguagesService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<LanguagesService>(LANGUAGES_PATH);
    })
});

@injectable()
export class LanguagesPlugin implements TheiaPlugin {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(Commands) @optional() protected readonly commands: Commands | undefined = undefined,
        @inject(Window) @optional() protected readonly window: Window | undefined = undefined,
        @inject(LanguagesService) protected readonly languagesService: LanguagesService,
        @inject(WebSocketConnectionProvider) protected readonly connection: WebSocketConnectionProvider) {
    }

    onStart(app: TheiaApplication): void {
        Promise.all([this.workspace.ready, this.languagesService.getLanguages()]).then(result => {
            const languages = result[1];
            for (const language of languages) {
                const languageClient = this.createLanguageClient(language);
                languageClient.start();
            }
        })
    }

    protected createLanguageClient(identifier: LanguageIdentifier): ILanguageClient {
        const { workspace, languages, commands, window } = this;
        const language = identifier.description;
        return new BaseLanguageClient({
            name: `${language.name || language.id} Language Client`,
            clientOptions: {
                documentSelector: language.documentSelector,
                synchronize: {
                    fileEvents: this.createFileSystemWatchers(language)
                }
            },
            services: { workspace, languages, commands, window },
            connectionProvider: {
                // FIXME get rid of outputChannel
                get: (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler, outputChannel: OutputChannel | undefined) =>
                    new Promise(resolve => {
                        this.connection.listen({
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

    protected createFileSystemWatchers(language: LanguageDescription): FileSystemWatcher[] {
        const watchers = [];
        if (this.workspace.createFileSystemWatcher && language.fileEvents) {
            for (const fileEvent of language.fileEvents) {
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
    }

}
