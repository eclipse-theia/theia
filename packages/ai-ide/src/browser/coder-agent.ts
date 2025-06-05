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
import { AbstractStreamParsingChatAgent, ChatRequestModel, ChatService, ChatSession, MutableChatModel, MutableChatRequestModel } from '@theia/ai-chat/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID } from '../common/workspace-functions';
import { CODER_SYSTEM_PROMPT_ID, getCoderAgentModePromptTemplate, getCoderPromptTemplateEdit, getCoderPromptTemplateSimpleEdit } from '../common/coder-replace-prompt-template';
import { SuggestFileContent } from './file-changeset-functions';
import { LanguageModelRequirement, PromptVariantSet } from '@theia/ai-core';
import { nls } from '@theia/core';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { AI_CHAT_NEW_CHAT_WINDOW_COMMAND, ChatCommands } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';

@injectable()
export class CoderAgent extends AbstractStreamParsingChatAgent {
    @inject(ChatService) protected readonly chatService: ChatService;
    id: string = 'Coder';
    name = 'Coder';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/coderAgent/description',
        'An AI assistant integrated into Theia IDE, designed to assist software developers. This agent can access the users workspace, it can get a list of all available files \
        and folders and retrieve their content. Furthermore, it can suggest modifications of files to the user. It can therefore assist the user with coding tasks or other \
        tasks involving file changes.');
    override prompts: PromptVariantSet[] = [{
        id: CODER_SYSTEM_PROMPT_ID,
        defaultVariant: getCoderPromptTemplateEdit(),
        variants: [getCoderPromptTemplateSimpleEdit(), getCoderAgentModePromptTemplate()]
    }];
    override functions = [GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID, SuggestFileContent.ID];
    protected override systemPromptId: string | undefined = CODER_SYSTEM_PROMPT_ID;
    override async invoke(request: MutableChatRequestModel): Promise<void> {
        await super.invoke(request);
        this.suggest(request);
    }
    async suggest(context: ChatSession | ChatRequestModel): Promise<void> {
        const contextIsRequest = ChatRequestModel.is(context);
        const model = contextIsRequest ? context.session : context.model;
        const session = contextIsRequest ? this.chatService.getSessions().find(candidate => candidate.model.id === model.id) : context;
        if (!(model instanceof MutableChatModel) || !session) { return; }
        if (model.isEmpty()) {
            model.setSuggestions([
                {
                    kind: 'callback',
                    callback: () => this.chatService.sendRequest(session.id, { text: '@Coder please look at #_f and fix any problems.' }),
                    content: '[Fix problems](_callback) in the current file.'
                },
            ]);
        } else {
            model.setSuggestions([new MarkdownStringImpl(`Keep chats short and focused. [Start a new chat](command:${AI_CHAT_NEW_CHAT_WINDOW_COMMAND.id}) for a new task`
                + ` or [start a new chat with a summary of this one](command:${ChatCommands.AI_CHAT_NEW_WITH_TASK_CONTEXT.id}).`)]);
        }
    }

}
