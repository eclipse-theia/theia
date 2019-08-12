/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as _ from 'lodash';
import { injectable, inject } from 'inversify';
// tslint:disable:no-implicit-dependencies
import { Range, CodeLens } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';
import { MessageService, CommandContribution, CommandRegistry, Command, DisposableCollection } from '@theia/core/lib/common';
import { FrontendApplicationContribution, } from '@theia/core/lib/browser';
import { Workspace, Languages } from '@theia/languages/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
// tslint:enable:no-implicit-dependencies
import { DebugConfiguration } from '@theia/debug/lib/common/debug-common';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { JavaDebugPreferences } from './java-debug-preferences';

enum HcrChangeType {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
    STARTING = 'STARTING',
    END = 'END',
    BUILD_COMPLETE = 'BUILD_COMPLETE',
}

enum LogLevel {
    FINE = 'FINE',
    INFO = 'INFO',
    SEVERE = 'SEVERE',
    WARNING = 'WARNING'
}

export namespace JavaDebugCommands {
    export const RUN: Command = {
        id: 'java.debug.run'
    };
    export const DEBUG: Command = {
        id: 'java.debug.debug'
    };
    export const RESOLVE_MAIN_METHOD = 'vscode.java.resolveMainMethod';
}

export namespace JavaDebugSession {
    export function is(session: DebugSession): boolean {
        return session.configuration.type === 'java';
    }
}

interface JavaMainMethod {
    range: Range;
    mainClass: string;
    projectName: string;
}

@injectable()
export class JavaDebugFrontendContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(Workspace)
    protected readonly workspace: Workspace;

    @inject(Languages)
    protected readonly languages: Languages;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(DebugSessionManager)
    protected readonly sessions: DebugSessionManager;

    @inject(JavaDebugPreferences)
    protected readonly preferences: JavaDebugPreferences;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(DebugConfigurationManager)
    protected readonly configurations: DebugConfigurationManager;

    protected readonly suppressedReasons = new Set<string>();

    initialize(): void {
        this.updateRunDebugCodeLens();
        this.preferences.onPreferenceChanged(({ preferenceName }) => {
            if (preferenceName === 'java.debug.settings.enableRunDebugCodeLens') {
                this.updateRunDebugCodeLens();
            }
        });
        this.sessions.onDidCreateDebugSession(session => {
            if (JavaDebugSession.is(session) && this.sessions.sessions.filter(JavaDebugSession.is).length === 1) {
                this.updateDebugSettings();
            }
        });
        this.sessions.onDidReceiveDebugSessionCustomEvent(({ session, event, body }) => {
            if (session.configuration.type !== 'java') {
                return;
            }
            if (event === 'hotcodereplace' && body) {
                return this.applyCodeChanges(session, body);
            }
            if (event === 'usernotification' && body) {
                return this.handleUserNotification(body);
            }
        });
        this.sessions.onDidDestroyDebugSession(session => {
            if (session.configuration.type === 'java') {
                this.suppressedReasons.clear();
            }
        });
        const { configurations } = this.workspace;
        if (configurations) {
            configurations.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('java.debug')) {
                    this.dirtyDebugSettings = true;
                    if (this.sessions.sessions.some(JavaDebugSession.is)) {
                        this.updateDebugSettings();
                    }
                }
            });
        }
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(JavaDebugCommands.RUN, {
            execute: (mainClass, projectName, uri) => this.runProgram(mainClass, projectName, uri)
        });
        commands.registerCommand(JavaDebugCommands.DEBUG, {
            execute: (mainClass, projectName, uri) => this.runProgram(mainClass, projectName, uri, false)
        });
    }

    protected readonly toDisposeRunDebugCodeLens = new DisposableCollection();
    protected updateRunDebugCodeLens(): void {
        if (!this.preferences['java.debug.settings.enableRunDebugCodeLens']) {
            this.toDisposeRunDebugCodeLens.dispose();
            return;
        }
        if (!this.languages.registerCodeLensProvider || !this.toDisposeRunDebugCodeLens.disposed) {
            return;
        }
        this.toDisposeRunDebugCodeLens.push(this.languages.registerCodeLensProvider([{ language: 'java' }], {
            provideCodeLenses: async params => {
                if (!this.commands.isEnabled(JavaDebugCommands.RESOLVE_MAIN_METHOD)) {
                    return [];
                }
                try {
                    const uri = params.textDocument.uri;
                    const mainMethods = await this.commands.executeCommand<JavaMainMethod[]>(JavaDebugCommands.RESOLVE_MAIN_METHOD, uri) || [];
                    return _.flatten(mainMethods.map(method => <CodeLens[]>[
                        {
                            range: method.range,
                            command: {
                                title: '▶ Run',
                                command: JavaDebugCommands.RUN.id,
                                arguments: [method.mainClass, method.projectName, uri]
                            }
                        },
                        {
                            range: method.range,
                            command: {
                                title: '🐞 Debug',
                                command: JavaDebugCommands.DEBUG.id,
                                arguments: [method.mainClass, method.projectName, uri]
                            }
                        }
                    ]));
                } catch (e) {
                    console.error(e);
                    return [];
                }

            }
        }));
    }

    protected async runProgram(mainClass: string, projectName: string, uri: string, noDebug: boolean = true): Promise<void> {
        const workspaceFolder = this.workspaceService.getWorkspaceRootUri(new URI(uri));
        const workspaceFolderUri = workspaceFolder && workspaceFolder.toString();
        const configuration = this.constructDebugConfig(mainClass, projectName, workspaceFolderUri);
        configuration.projectName = projectName;
        configuration.noDebug = noDebug;
        await this.sessions.start({
            configuration,
            workspaceFolderUri
        });
    }
    protected constructDebugConfig(mainClass: string, projectName: string, workspaceFolderUri?: string): DebugConfiguration {
        return _.cloneDeep(this.findConfiguration(mainClass, projectName).next().value || {
            type: 'java',
            name: `CodeLens (Launch) - ${mainClass.substr(mainClass.lastIndexOf('.') + 1)}`,
            request: 'launch',
            cwd: workspaceFolderUri ? '${workspaceFolder}' : undefined,
            console: 'internalConsole',
            stopOnEntry: false,
            mainClass,
            args: '',
            projectName,
        });
    }
    protected * findConfiguration(mainClass: string, projectName: string): IterableIterator<DebugConfiguration> {
        for (const option of this.configurations.all) {
            const { configuration } = option;
            if (configuration.mainClass === mainClass && _.toString(configuration.projectName) === _.toString(projectName)) {
                yield configuration;
            }
        }
        for (const option of this.configurations.all) {
            const { configuration } = option;
            if (configuration.mainClass === mainClass && !configuration.projectName) {
                yield configuration;
            }
        }
    }

    protected dirtyDebugSettings = true;
    protected async updateDebugSettings(): Promise<void> {
        if (!this.dirtyDebugSettings) {
            return;
        }
        this.dirtyDebugSettings = false;
        const { configurations } = this.workspace;
        if (configurations) {
            const configuration = configurations.getConfiguration('java.debug');
            const logLevel = this.convertLogLevel(configuration.logLevel || '');
            if (configuration.settings && Object.keys(configuration.settings).length) {
                await this.commands.executeCommand('vscode.java.updateDebugSettings', JSON.stringify({
                    ...configuration.settings, logLevel
                }));
            }
        }
    }
    protected convertLogLevel(commonLogLevel: string): LogLevel {
        // convert common log level to java log level
        switch (commonLogLevel.toLowerCase()) {
            case 'verbose':
                return LogLevel.FINE;
            case 'warn':
                return LogLevel.WARNING;
            case 'error':
                return LogLevel.SEVERE;
            case 'info':
                return LogLevel.INFO;
            default:
                return LogLevel.FINE;
        }
    }

    protected async applyCodeChanges(session: DebugSession, { changeType, message }: { changeType?: HcrChangeType, message: string }): Promise<void> {
        if (changeType === HcrChangeType.BUILD_COMPLETE) {
            this.messages.info('Applying code changes...');
            session.sendCustomRequest('redefineClasses');
            return;
        }
        if (changeType === HcrChangeType.ERROR || changeType === HcrChangeType.WARNING) {
            if (this.suppressedReasons.has(message)) {
                return;
            }
            const response = await this.messages.error(
                `Hot code replace failed - ${message}. Would you like to restart the debug session?`,
                'Yes', 'No', 'Not show again'
            );
            if (response === 'Not show again') {
                this.suppressedReasons.add(message);
            } else if (response === 'Yes') {
                this.sessions.restart(session);
            }
        }
    }

    protected async handleUserNotification({ notificationType, message }: { notificationType?: string, message: string }): Promise<void> {
        if (notificationType === 'ERROR') {
            await this.messages.error(message);
        } else if (notificationType === 'WARNING') {
            await this.messages.warn(message);
        } else {
            await this.messages.info(message);
        }
    }

}
