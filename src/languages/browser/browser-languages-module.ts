/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, injectable, inject, optional } from "inversify";
import { MessageConnection } from 'vscode-jsonrpc';
import { ErrorAction, CloseAction } from "vscode-base-languageclient/lib/base";
import { DisposableCollection } from '../../application/common';
import { TheiaPlugin, TheiaApplication } from "../../application/browser";
import { WebSocketConnection } from "../../messaging/browser";
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
    LanguageDescription,
    FileSystemWatcher,
    LanguagesService,
    LANGUAGES_PATH
} from '../common';

export const browserLanguagesModule = new ContainerModule(bind => {
    bind(Window).to(ConsoleWindow).inSingletonScope();
    bind(TheiaPlugin).to(LanguagesPlugin).inSingletonScope();

    bind<LanguagesService>(LanguagesService).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnection);
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
        @inject(WebSocketConnection) protected readonly connection: WebSocketConnection) {
    }

    onStart(app: TheiaApplication): void {
        Promise.all([this.workspace.ready, this.languagesService.getLanguages()]).then(result => {
            const languages = result[1];
            for (const language of languages) {
                this.connection.listen({
                    path: language.path,
                    onConnection: connection => {
                        const watchers = this.createFileSystemWatchers(language.description);
                        const languageClient = this.createLanguageClient(language.description, watchers, connection);

                        const disposeOnClose = new DisposableCollection();
                        disposeOnClose.pushAll(watchers);
                        disposeOnClose.push(languageClient.start());
                        connection.onClose(() => disposeOnClose.dispose());
                    }
                });
            }
        })
    }

    protected createLanguageClient(language: LanguageDescription, fileEvents: FileSystemWatcher[], connection: MessageConnection): ILanguageClient {
        const { workspace, languages, commands, window } = this;
        return new BaseLanguageClient({
            name: `${language.name || language.id} Language Client`,
            clientOptions: {
                documentSelector: language.documentSelector,
                synchronize: {
                    fileEvents
                },
                errorHandler: {
                    error: () => ErrorAction.Continue,
                    closed: () => CloseAction.DoNotRestart
                }
            },
            services: { workspace, languages, commands, window },
            connectionProvider: {
                // FIXME get rid of outputChannel
                get: (errorHandler: ConnectionErrorHandler, closeHandler: ConnectionCloseHandler, outputChannel: OutputChannel | undefined) => {
                    return Promise.resolve(createConnection(connection, errorHandler, closeHandler));
                }
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
