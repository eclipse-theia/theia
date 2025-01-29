// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';

@injectable()
export class TaskContextKeyService {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(ApplicationServer)
    protected readonly applicationServer: ApplicationServer;

    // The context keys are supposed to be aligned with VS Code. See also:
    // https://github.com/microsoft/vscode/blob/e6125a356ff6ebe7214b183ee1b5fb009a2b8d31/src/vs/workbench/contrib/tasks/common/taskService.ts#L20-L24
    protected customExecutionSupported: ContextKey<boolean>;
    protected shellExecutionSupported: ContextKey<boolean>;
    protected processExecutionSupported: ContextKey<boolean>;
    protected serverlessWebContext: ContextKey<boolean>;
    protected taskCommandsRegistered: ContextKey<boolean>;

    @postConstruct()
    protected init(): void {
        this.customExecutionSupported = this.contextKeyService.createKey('customExecutionSupported', true);
        this.shellExecutionSupported = this.contextKeyService.createKey('shellExecutionSupported', true);
        this.processExecutionSupported = this.contextKeyService.createKey('processExecutionSupported', true);
        this.serverlessWebContext = this.contextKeyService.createKey('serverlessWebContext', false);
        this.taskCommandsRegistered = this.contextKeyService.createKey('taskCommandsRegistered', true);
        this.applicationServer.getApplicationPlatform().then(platform => {
            if (platform === 'web') {
                this.setShellExecutionSupported(false);
                this.setProcessExecutionSupported(false);
                this.setServerlessWebContext(true);
            }
        });
    }

    setCustomExecutionSupported(customExecutionSupported: boolean): void {
        this.customExecutionSupported.set(customExecutionSupported);
    }

    setShellExecutionSupported(shellExecutionSupported: boolean): void {
        this.shellExecutionSupported.set(shellExecutionSupported);
    }

    setProcessExecutionSupported(processExecutionSupported: boolean): void {
        this.processExecutionSupported.set(processExecutionSupported);
    }

    setServerlessWebContext(serverlessWebContext: boolean): void {
        this.serverlessWebContext.set(serverlessWebContext);
    }

    setTaskCommandsRegistered(taskCommandsRegistered: boolean): void {
        this.taskCommandsRegistered.set(taskCommandsRegistered);
    }

}
