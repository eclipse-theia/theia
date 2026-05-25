// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatAgentLocation, ChatService } from '@theia/ai-chat/lib/common';
import { CommandContribution, CommandRegistry, CommandService } from '@theia/core';
import { TaskContextStorageService, TaskContextService } from '@theia/ai-chat/lib/browser/task-context-service';
import { injectable, inject } from '@theia/core/shared/inversify';
import { AI_EXECUTE_PLAN_WITH_CODER } from '../common/summarize-session-commands';
import { CoderAgent } from './coder-agent';
import { TASK_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/browser/task-context-variable';

import { FILE_VARIABLE } from '@theia/ai-core/lib/browser/file-variable-contribution';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AICommandHandlerFactory } from '@theia/ai-core/lib/browser';

@injectable()
export class SummarizeSessionCommandContribution implements CommandContribution {
    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(TaskContextService)
    protected readonly taskContextService: TaskContextService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(CoderAgent)
    protected readonly coderAgent: CoderAgent;

    @inject(TaskContextStorageService)
    protected readonly taskContextStorageService: TaskContextStorageService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly wsService: WorkspaceService;

    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(AI_EXECUTE_PLAN_WITH_CODER, this.commandHandlerFactory({
            execute: async (taskContextId?: string) => {
                const activeSession = this.chatService.getActiveSession();

                if (!activeSession) {
                    return;
                }

                // Find the task context by ID or fall back to most recent for this session
                let existingTaskContext;
                if (taskContextId) {
                    existingTaskContext = this.taskContextService.getAll().find(s => s.id === taskContextId);
                } else {
                    const sessionContexts = this.taskContextService.getAll().filter(s => s.sessionId === activeSession.id);
                    existingTaskContext = sessionContexts[sessionContexts.length - 1];
                }

                if (!existingTaskContext) {
                    console.warn('No task context found. Use createTaskContext to create a plan first.');
                    return;
                }

                if (existingTaskContext.uri) {
                    if (await this.fileService.exists(existingTaskContext.uri)) {
                        const wsRelativePath = await this.wsService.getWorkspaceRelativePath(existingTaskContext.uri);
                        const fileVariable: AIVariableResolutionRequest = {
                            variable: FILE_VARIABLE,
                            arg: wsRelativePath
                        };
                        activeSession.model.context.addVariables(fileVariable);
                    }
                }

                const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, this.coderAgent);
                const summaryVariable = { variable: TASK_CONTEXT_VARIABLE, arg: existingTaskContext.id };
                newSession.model.context.addVariables(summaryVariable);
            }
        }));
    }
}
