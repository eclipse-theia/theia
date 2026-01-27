// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { AIContextVariable, AIVariableService } from '@theia/ai-core';
import { Command, CommandContribution, CommandRegistry, Path, URI } from '@theia/core';
import { open, OpenerService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ChatService } from '../common';

export const VARIABLE_ADD_CONTEXT_COMMAND: Command = Command.toLocalizedCommand({
    id: 'add-context-variable',
    label: 'Add context variable'
}, 'theia/ai/chat-ui/addContextVariable');

export const OPEN_FILE_BY_PATH_COMMAND: Command = {
    id: 'ai-chat.open-file-by-path',
};

@injectable()
export class AIChatFrontendContribution implements CommandContribution {
    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;
    @inject(ChatService)
    protected readonly chatService: ChatService;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(FileService)
    protected readonly fileService: FileService;
    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(VARIABLE_ADD_CONTEXT_COMMAND, {
            execute: (...args) => args.length > 1 && this.addContextVariable(args[0], args[1]),
            isVisible: () => false,
        });

        registry.registerCommand(OPEN_FILE_BY_PATH_COMMAND, {
            execute: (wsRelativePath: string) => this.openFileByPath(wsRelativePath),
            isVisible: () => false,
        });
    }

    async addContextVariable(variableName: string, arg: string | undefined): Promise<void> {
        const variable = this.variableService.getVariable(variableName);
        if (!variable || !AIContextVariable.is(variable)) {
            return;
        }

        this.chatService.getActiveSession()?.model.context.addVariables({ variable, arg });
    }

    /**
     * Open a file by its workspace-relative path.
     */
    async openFileByPath(wsRelativePath: string): Promise<void> {
        const uri = await this.resolveWorkspaceRelativePath(wsRelativePath);
        if (uri) {
            await open(this.openerService, uri);
        }
    }

    protected async resolveWorkspaceRelativePath(wsRelativePath: string): Promise<URI | undefined> {
        const path = new Path(Path.normalizePathSeparator(wsRelativePath));
        if (path.isAbsolute) {
            const uri = new URI(wsRelativePath);
            if (await this.fileService.exists(uri)) {
                return uri;
            }
            return undefined;
        }
        const workspaceRoots = this.workspaceService.tryGetRoots();
        for (const root of workspaceRoots) {
            const uri = root.resource.resolve(path);
            if (await this.fileService.exists(uri)) {
                return uri;
            }
        }
        return undefined;
    }
}
