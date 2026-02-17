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
import {
    ChatMode, ChatRequestModel, ChatService, ChatSession,
    MutableChatModel, MutableChatRequestModel
} from '@theia/ai-chat/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    CODER_SYSTEM_PROMPT_ID,
    CODER_EDIT_TEMPLATE_ID,
    CODER_AGENT_MODE_TEMPLATE_ID,
    CODER_AGENT_MODE_NEXT_TEMPLATE_ID,
    getCoderAgentModePromptTemplate,
    getCoderAgentModeNextPromptTemplate,
    getCoderPromptTemplateEdit,
    getCoderPromptTemplateEditNext
} from '../common/coder-replace-prompt-template';
import { LanguageModelRequirement, PromptVariantSet } from '@theia/ai-core';
import { nls } from '@theia/core';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { AI_CHAT_NEW_CHAT_WINDOW_COMMAND, ChatCommands } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { AbstractModeAwareChatAgent } from './mode-aware-chat-agent';

@injectable()
export class CoderAgent extends AbstractModeAwareChatAgent {
    @inject(ChatService) protected readonly chatService: ChatService;
    id: string = 'Coder';
    name = 'Coder';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/code',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/coderAgent/description',
        'An AI assistant integrated into Theia IDE, designed to assist software developers. This agent can access the users workspace, it can get a list of all available files \
        and folders and retrieve their content. Furthermore, it can suggest modifications of files to the user. It can therefore assist the user with coding tasks or other \
        tasks involving file changes.');

    protected readonly modeDefinitions: Omit<ChatMode, 'isDefault'>[] = [
        {
            id: CODER_EDIT_TEMPLATE_ID,
            name: nls.localize('theia/ai/ide/coderAgent/mode/edit', 'Edit Mode')
        },
        {
            id: CODER_AGENT_MODE_TEMPLATE_ID,
            name: nls.localizeByDefault('Agent Mode')
        },
        {
            id: CODER_AGENT_MODE_NEXT_TEMPLATE_ID,
            name: nls.localize('theia/ai/ide/coderAgent/mode/agentNext', 'Agent Mode (Next)')
        },
    ];

    override prompts: PromptVariantSet[] = [{
        id: CODER_SYSTEM_PROMPT_ID,
        defaultVariant: getCoderPromptTemplateEdit(),
        variants: [getCoderAgentModePromptTemplate(), getCoderAgentModeNextPromptTemplate(), getCoderPromptTemplateEditNext()]
    }];
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
                    callback: () => this.chatService.sendRequest(session.id, {
                        text: `@Coder ${nls.localize('theia/ai/ide/coderAgent/suggestion/fixProblems/prompt', 'please look at {1} and fix any problems.', '#_f')}`
                    }),
                    content: nls.localize('theia/ai/ide/coderAgent/suggestion/fixProblems/content', '[Fix problems]({0}) in the current file.', '_callback')
                },
            ]);
        } else {
            model.setSuggestions([new MarkdownStringImpl(nls.localize('theia/ai/ide/coderAgent/suggestion/startNewChat',
                'Keep chats short and focused. [Start a new chat]({0}) for a new task or [start a new chat with a summary of this one]({1}).',
                `command:${AI_CHAT_NEW_CHAT_WINDOW_COMMAND.id}`, `command:${ChatCommands.AI_CHAT_NEW_WITH_TASK_CONTEXT.id}`))]);
        }
    }

}
