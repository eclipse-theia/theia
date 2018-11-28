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

import { injectable, inject } from 'inversify';
// tslint:disable-next-line:no-implicit-dependencies
import { MessageService, CommandService } from '@theia/core/lib/common';
// tslint:disable-next-line:no-implicit-dependencies
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
// tslint:disable-next-line:no-implicit-dependencies
import { Workspace } from '@theia/languages/lib/browser';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';

enum HcrChangeType {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
    STARTING = 'STARTING',
    END = 'END',
    BUILD_COMPLETE = 'BUILD_COMPLETE',
}

export namespace JavaDebugSession {
    export function is(session: DebugSession): boolean {
        return session.configuration.type === 'java';
    }
}

@injectable()
export class JavaDebugFrontendContribution implements FrontendApplicationContribution {

    @inject(Workspace)
    protected readonly workspace: Workspace;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(DebugSessionManager)
    protected readonly sessions: DebugSessionManager;

    protected readonly suppressedReasons = new Set<string>();

    initialize(): void {
        this.sessions.onDidCreateDebugSession(session => {
            if (JavaDebugSession.is(session) && this.sessions.sessions.filter(JavaDebugSession.is).length === 1) {
                this.updateDebugSettings();
            }
        });
        this.sessions.onDidReceiveDebugSessionCustomEvent(async ({ session, event, body }) => {
            if (session.configuration.type !== 'java') {
                return;
            }
            if (event === 'hotcodereplace' && body) {
                this.applyCodeChanges(session, body);
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
    protected convertLogLevel(commonLogLevel: string) {
        // convert common log level to java log level
        switch (commonLogLevel.toLowerCase()) {
            case 'verbose':
                return 'FINE';
            case 'warn':
                return 'WARNING';
            case 'error':
                return 'SEVERE';
            case 'info':
                return 'INFO';
            default:
                return 'FINE';
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

}
