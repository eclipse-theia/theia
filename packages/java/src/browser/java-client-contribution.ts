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
import { CommandService } from "@theia/core/lib/common";
import {
    Window, ILanguageClient, BaseLanguageClientContribution, Workspace, Languages, LanguageClientFactory, LanguageClientOptions
} from '@theia/languages/lib/browser';
import { JAVA_LANGUAGE_ID, JAVA_LANGUAGE_NAME } from '../common';
import { ActionableNotification, ActionableMessage, StatusReport, StatusNotification } from "./java-protocol";
import { StatusBar, StatusBarEntry, StatusBarAlignment } from "@theia/core/lib/browser";

@injectable()
export class JavaClientContribution extends BaseLanguageClientContribution {

    readonly id = JAVA_LANGUAGE_ID;
    readonly name = JAVA_LANGUAGE_NAME;
    private readonly statusNotificationName = "java-status-notification";
    private statusBarTimeout: number | undefined;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(Window) protected readonly window: Window,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(StatusBar) protected readonly statusBar: StatusBar
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns() {
        return ['**/*.java', '**/pom.xml', '**/*.gradle'];
    }

    protected get workspaceContains() {
        return ['pom.xml', 'build.gradle'];
    }

    protected onReady(languageClient: ILanguageClient): void {
        languageClient.onNotification(ActionableNotification.type, this.showActionableMessage.bind(this));
        languageClient.onNotification(StatusNotification.type, this.showStatusMessage.bind(this));
        super.onReady(languageClient);
    }

    protected showStatusMessage(message: StatusReport) {
        if (this.statusBarTimeout) {
            window.clearTimeout(this.statusBarTimeout);
            this.statusBarTimeout = undefined;
        }
        const statusEntry = {
            alignment: StatusBarAlignment.LEFT,
            priority: 1,
            text: "$(refresh~spin) " + message.message
        } as StatusBarEntry;
        this.statusBar.setElement(this.statusNotificationName, statusEntry);
        this.statusBarTimeout = window.setTimeout(() => {
            this.statusBar.removeElement(this.statusNotificationName);
            this.statusBarTimeout = undefined;
        }, 5000);
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

    protected createOptions(): LanguageClientOptions {
        const options = super.createOptions();
        options.initializationOptions = {
            extendedClientCapabilities: {
                classFileContentsSupport: true
            }
        };
        return options;
    }

}
