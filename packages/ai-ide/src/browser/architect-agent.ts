// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { AbstractStreamParsingChatAgent, ChatRequestModel, ChatService, ChatSession, MutableChatModel, MutableChatRequestModel } from '@theia/ai-chat/lib/common';
import { TaskContextStorageService } from '@theia/ai-chat/lib/browser/task-context-service';
import { LanguageModelRequirement } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { architectSystemVariants, ARCHITECT_PLANNING_PROMPT_ID } from '../common/architect-prompt-template';
import { nls } from '@theia/core';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER, AI_UPDATE_TASK_CONTEXT_COMMAND, AI_EXECUTE_PLAN_WITH_CODER } from '../common/summarize-session-commands';

@injectable()
export class ArchitectAgent extends AbstractStreamParsingChatAgent {
    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(TaskContextStorageService) protected readonly taskContextStorageService: TaskContextStorageService;

    name = 'Architect';
    id = 'Architect';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/code',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/workspaceAgent/description',
        'An AI assistant integrated into Theia IDE, designed to assist software developers. This agent can access the users workspace, it can get a list of all available files \
         and folders and retrieve their content. It cannot modify files. It can therefore answer questions about the current project, project files and source code in the \
         workspace, such as how to build the project, where to put source code, where to find specific code or configurations, etc.');
    override prompts = [architectSystemVariants];
    protected override systemPromptId: string | undefined = architectSystemVariants.id;

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        await super.invoke(request);
        this.suggest(request);
    }

    async suggest(context: ChatSession | ChatRequestModel): Promise<void> {
        const model = ChatRequestModel.is(context) ? context.session : context.model;
        const session = this.chatService.getSessions().find(candidate => candidate.model.id === model.id);
        if (!(model instanceof MutableChatModel) || !session) { return; }
        if (!model.isEmpty()) {
            // Check if we're using the next prompt variant, if so, we show different actions
            const lastRequest = model.getRequests().at(-1);
            const isNextVariant = lastRequest?.response?.promptVariantId === ARCHITECT_PLANNING_PROMPT_ID;

            if (isNextVariant) {
                const taskContexts = this.taskContextStorageService.getAll().filter(s => s.sessionId === session.id);
                if (taskContexts.length > 0) {
                    const suggestions = taskContexts.map(tc =>
                        new MarkdownStringImpl(`[${nls.localize('theia/ai/ide/architectAgent/suggestion/executePlanWithCoder',
                            'Execute "{0}" with Coder', tc.label)}](command:${AI_EXECUTE_PLAN_WITH_CODER.id}?${encodeURIComponent(JSON.stringify(tc.id))}).`)
                    );
                    model.setSuggestions(suggestions);
                }
            } else {
                model.setSuggestions([
                    new MarkdownStringImpl(`[${nls.localize('theia/ai/ide/architectAgent/suggestion/summarizeSessionAsTaskForCoder',
                        'Summarize this session as a task for Coder')}](command:${AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER.id}).`),
                    new MarkdownStringImpl(`[${nls.localize('theia/ai/ide/architectAgent/suggestion/updateTaskContext',
                        'Update current task context')}](command:${AI_UPDATE_TASK_CONTEXT_COMMAND.id}).`)
                ]);
            }
        }
    }
}
