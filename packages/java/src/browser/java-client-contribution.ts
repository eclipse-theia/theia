/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CommandService } from "@theia/core/lib/common";
import {
    Window, ILanguageClient, BaseLanguageClientContribution, Workspace, Languages, LanguageClientFactory
} from '@theia/languages/lib/browser';
import { JAVA_LANGUAGE_ID, JAVA_LANGUAGE_NAME } from '../common';
import { ActionableNotification, ActionableMessage } from "./java-protocol";

@injectable()
export class JavaClientContribution extends BaseLanguageClientContribution {

    readonly id = JAVA_LANGUAGE_ID;
    readonly name = JAVA_LANGUAGE_NAME;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(Window) protected readonly window: Window,
        @inject(CommandService) protected readonly commandService: CommandService
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns() {
        return ['**/*.java', '**/pom.xml', '**/*.gradle'];
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

}
