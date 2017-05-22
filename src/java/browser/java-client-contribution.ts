/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CommandService } from "../../application/common";
import {
    Workspace, Languages, Window,
    ILanguageClient, BaseLanguageClientContribution, FileSystemWatcher, LanguageClientFactory
} from '../../languages/browser';
import { JAVA_LANGUAGE_ID } from '../common';
import { ActionableNotification, ActionableMessage } from "./java-protocol";

@injectable()
export class JavaClientContribution extends BaseLanguageClientContribution {

    readonly id = JAVA_LANGUAGE_ID;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(Window) protected readonly window: Window,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(CommandService) protected readonly commandService: CommandService
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected onReady(languageClient: ILanguageClient): void {
        languageClient.onNotification(ActionableNotification.type, this.showActionableMessage.bind(this));
        super.onReady(languageClient);
    }

    protected showActionableMessage(message: ActionableMessage): void {
        const items = message.commands || [];
        this.window.showMessage(message.severity, message.message, ...items).then(command => {
            if (command) {
                const args = command.arguments || [];
                this.commandService.executeCommand(command.command, ...args);
            }
        });
    }

    protected createFileEvents(): FileSystemWatcher[] {
        const watchers = [];
        if (this.workspace.createFileSystemWatcher) {
            watchers.push(this.workspace.createFileSystemWatcher('**/*.java'));
            watchers.push(this.workspace.createFileSystemWatcher('**/pom.xml'));
            watchers.push(this.workspace.createFileSystemWatcher('**/*.gradle'));
        }
        return watchers;
    }

}