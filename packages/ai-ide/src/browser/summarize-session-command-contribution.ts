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
import { AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER, AI_UPDATE_TASK_CONTEXT_COMMAND, AI_EXECUTE_PLAN_WITH_CODER } from '../common/summarize-session-commands';
import { CoderAgent } from './coder-agent';
import { TASK_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/browser/task-context-variable';
import { TASK_CONTEXT_CREATE_PROMPT_ID, TASK_CONTEXT_UPDATE_PROMPT_ID } from '../common/task-context-prompt-template';
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
        registry.registerCommand(AI_UPDATE_TASK_CONTEXT_COMMAND, this.commandHandlerFactory({
            execute: async () => {
                const activeSession = this.chatService.getActiveSession();

                if (!activeSession) {
                    return;
                }

                // Check if there is an existing summary for this session
                if (!this.taskContextService.hasSummary(activeSession)) {
                    // If no summary exists, create one first
                    await this.taskContextService.summarize(activeSession, TASK_CONTEXT_CREATE_PROMPT_ID);
                } else {
                    // Update existing summary
                    await this.taskContextService.update(activeSession, TASK_CONTEXT_UPDATE_PROMPT_ID);
                }
            }
        }));

        registry.registerCommand(AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER, this.commandHandlerFactory({
            execute: async () => {
                const activeSession = this.chatService.getActiveSession();

                if (!activeSession) {
                    return;
                }

                const summaryId = await this.taskContextService.summarize(activeSession, TASK_CONTEXT_CREATE_PROMPT_ID);

                // Open the summary in a new editor
                await this.taskContextStorageService.open(summaryId);

                // Add the summary file to the context of the active Architect session
                const summary = this.taskContextService.getAll().find(s => s.id === summaryId);
                if (summary?.uri) {
                    if (await this.fileService.exists(summary?.uri)) {
                        const wsRelativePath = await this.wsService.getWorkspaceRelativePath(summary?.uri);
                        // Create a file variable for the summary
                        const fileVariable: AIVariableResolutionRequest = {
                            variable: FILE_VARIABLE,
                            arg: wsRelativePath
                        };

                        // Add the file to the active session's context
                        activeSession.model.context.addVariables(fileVariable);
                    }

                    // Create a new session with the coder agent
                    const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, this.coderAgent);
                    const summaryVariable = { variable: TASK_CONTEXT_VARIABLE, arg: summaryId };
                    newSession.model.context.addVariables(summaryVariable);
                }
            }
        }));

        // New command: Execute plan with Coder (skips LLM summarization, uses existing task context)
        registry.registerCommand(AI_EXECUTE_PLAN_WITH_CODER, this.commandHandlerFactory({
            execute: async () => {
                const activeSession = this.chatService.getActiveSession();

                if (!activeSession) {
                    return;
                }

                // Find the existing task context for this session (created by createTaskContext function)
                const existingTaskContext = this.taskContextService.getAll().find(s => s.sessionId === activeSession.id);

                if (!existingTaskContext) {
                    // No task context exists for this session
                    console.warn('No task context found for current session. Use createTaskContext to create a plan first.');
                    return;
                }

                // Add the task context file to the Architect session's context if it exists as a file
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

                // Create a new session with the coder agent
                const newSession = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, this.coderAgent);
                const summaryVariable = { variable: TASK_CONTEXT_VARIABLE, arg: existingTaskContext.id };
                newSession.model.context.addVariables(summaryVariable);
            }
        }));
    }
}
