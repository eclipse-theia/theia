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
import { LanguageModelRequirement } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { architectSystemVariants, architectTaskSummaryVariants } from '../common/architect-prompt-template';
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID } from '../common/workspace-functions';
import { nls } from '@theia/core';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER, AI_UPDATE_TASK_CONTEXT_COMMAND } from '../common/summarize-session-commands';

@injectable()
export class ArchitectAgent extends AbstractStreamParsingChatAgent {
    @inject(ChatService) protected readonly chatService: ChatService;

    name = 'Architect';
    id = 'Architect';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/workspaceAgent/description',
        'An AI assistant integrated into Theia IDE, designed to assist software developers. This agent can access the users workspace, it can get a list of all available files \
         and folders and retrieve their content. It cannot modify files. It can therefore answer questions about the current project, project files and source code in the \
         workspace, such as how to build the project, where to put source code, where to find specific code or configurations, etc.');
    override prompts = [architectSystemVariants, architectTaskSummaryVariants];
    override functions = [GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID];
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
            model.setSuggestions([
                new MarkdownStringImpl(`[Summarize this session as a task for Coder](command:${AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER.id}).`),
                new MarkdownStringImpl(`[Update current task context](command:${AI_UPDATE_TASK_CONTEXT_COMMAND.id}).`)
            ]);
        }
    }
}
