/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ResourceResolver, CommandService } from "../../application/common";
import URI from "../../application/common/uri";
import { EditorManager } from "../../editor/browser";
import {
    ILanguageClient, LanguageIdentifier, LanguageClientContribution,
    Window, Workspace
} from '../../languages/browser';
import { JAVA_LANGUAGE_ID, JAVA_SCHEME } from '../common';
import { JavaResource } from "./java-resource";
import { ActionableNotification, ActionableMessage } from "./java-protocol";

@injectable()
export class JavaClientContribution implements ResourceResolver, LanguageClientContribution {

    protected languageClient: ILanguageClient | undefined;

    protected resolveDidStart: (languageClient: ILanguageClient) => void;
    protected didStart: Promise<ILanguageClient>;

    constructor(
        @inject(Window) protected readonly window: Window,
        @inject(CommandService) protected readonly commands: CommandService,
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(EditorManager) protected readonly editorManager: EditorManager
    ) {
        this.waitForDidStart();
    }

    resolve(uri: URI): JavaResource {
        if (uri.scheme !== JAVA_SCHEME) {
            throw new Error("The given uri is not a java uri: " + uri);
        }
        const resolveLanguageClient = this.resolveLanguageClient.bind(this);
        return new JavaResource(uri, resolveLanguageClient);
    }

    protected resolveLanguageClient(): Promise<ILanguageClient> {
        return this.languageClient ? Promise.resolve(this.languageClient) : this.didStart;
    }

    onWillStart(language: LanguageIdentifier, languageClient: ILanguageClient): void {
        if (language.description.id === JAVA_LANGUAGE_ID) {
            languageClient.onReady().then(() =>
                this.onDidStart(language, languageClient)
            );
        }
    }

    protected onDidStart(language: LanguageIdentifier, languageClient: ILanguageClient): void {
        languageClient.onNotification(ActionableNotification.type, this.showActionableMessage.bind(this));
        this.languageClient = languageClient
        this.resolveDidStart(this.languageClient);
        this.waitForDidStart();
    }

    protected waitForDidStart(): void {
        this.didStart = new Promise<ILanguageClient>(resolve =>
            this.resolveDidStart = resolve
        );
    }

    protected showActionableMessage(message: ActionableMessage): void {
        if (!this.window) {
            return;
        }
        const items = message.commands || [];
        this.window.showMessage(message.severity, message.message, ...items).then(command => {
            if (command) {
                const args = command.arguments || [];
                this.commands.executeCommand(command.command, ...args);
            }
        });
    }

}