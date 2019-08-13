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

// Copyright (c) Red Hat.
// Licensed under EPL-1.0 license
// Function parseVMargs() copied and modified https://github.com/redhat-developer/vscode-java/blob/v0.44.0/src/javaServerStarter.ts#L105-L121

import { injectable, inject } from 'inversify';
import { MessageConnection } from 'vscode-jsonrpc';
import { CommandService } from '@theia/core/lib/common';
import { StatusBar, StatusBarEntry, StatusBarAlignment } from '@theia/core/lib/browser';
import { SemanticHighlightingService } from '@theia/editor/lib/browser/semantic-highlight/semantic-highlighting-service';
import {
    Window,
    ILanguageClient,
    BaseLanguageClientContribution,
    Workspace, Languages,
    LanguageClientFactory,
    LanguageClientOptions
} from '@theia/languages/lib/browser';
import { JAVA_LANGUAGE_ID, JAVA_LANGUAGE_NAME, JavaStartParams } from '../common';
import {
    ActionableNotification,
    ActionableMessage,
    StatusReport,
    StatusNotification,
    ExecuteClientCommand
} from './java-protocol';
import { MaybePromise } from '@theia/core';
import { PreferenceService } from '@theia/core/lib/browser/preferences';

@injectable()
export class JavaClientContribution extends BaseLanguageClientContribution {

    readonly id = JAVA_LANGUAGE_ID;
    readonly name = JAVA_LANGUAGE_NAME;
    private readonly statusNotificationName = 'java-status-notification';
    private statusBarTimeout: number | undefined;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(Window) protected readonly window: Window,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(StatusBar) protected readonly statusBar: StatusBar,
        @inject(SemanticHighlightingService) protected readonly semanticHighlightingService: SemanticHighlightingService
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns(): string[] {
        return ['**/*.java', '**/pom.xml', '**/*.gradle'];
    }

    protected get workspaceContains(): string[] {
        return ['pom.xml', 'build.gradle'];
    }

    get configurationSection(): string {
        return 'java';
    }

    protected onReady(languageClient: ILanguageClient): void {
        languageClient.onNotification(ActionableNotification.type.method, this.showActionableMessage.bind(this));
        languageClient.onNotification(StatusNotification.type.method, this.showStatusMessage.bind(this));
        languageClient.onRequest(ExecuteClientCommand.type.method, params => this.commandService.executeCommand(params.command, ...params.arguments));
        super.onReady(languageClient);
    }

    protected createLanguageClient(connection: MessageConnection): ILanguageClient {
        const client: ILanguageClient & Readonly<{ languageId: string }> = Object.assign(super.createLanguageClient(connection), { languageId: this.id });
        client.registerFeature(SemanticHighlightingService.createNewFeature(this.semanticHighlightingService, client));
        return client;
    }

    protected showStatusMessage(message: StatusReport): void {
        if (this.statusBarTimeout) {
            window.clearTimeout(this.statusBarTimeout);
            this.statusBarTimeout = undefined;
        }
        const statusEntry = {
            alignment: StatusBarAlignment.LEFT,
            priority: 1,
            text: '$(refresh~spin) ' + message.message
        } as StatusBarEntry;
        this.statusBar.setElement(this.statusNotificationName, statusEntry);
        this.statusBarTimeout = window.setTimeout(() => {
            this.statusBar.removeElement(this.statusNotificationName);
            this.statusBarTimeout = undefined;
        }, 500);
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

    protected getStartParameters(): MaybePromise<JavaStartParams> {
        const workspace = this.workspace.rootUri ? this.workspace.rootUri : undefined;
        const jvmArgs: string[] = [];
        const vmargsLine = this.preferenceService.get('java.jdt.ls.vmargs', '');
        this.parseVMargs(jvmArgs, vmargsLine);
        return { workspace, jvmArgs };
    }

    private parseVMargs(params: string[], vmargsLine: string): void {
        if (!vmargsLine) {
            return;
        }
        const vmargs = vmargsLine.match(/(?:[^\s"]+|"[^"]*")+/g);
        if (vmargs === null) {
            return;
        }
        vmargs.forEach(arg => {
            // remove all standalone double quotes
            arg = arg.replace(/(\\)?"/g, ($0, $1) => ($1 ? $0 : ''));
            // unescape all escaped double quotes
            arg = arg.replace(/(\\)"/g, '"');
            if (params.indexOf(arg) < 0) {
                params.push(arg);
            }
        });
    }
}
