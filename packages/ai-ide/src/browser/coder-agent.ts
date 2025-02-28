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
import { AbstractStreamParsingChatAgent, ChatService, CommandChatResponseContentImpl, MutableChatRequestModel } from '@theia/ai-chat/lib/common';
import { LanguageModelRequirement, PromptTemplate } from '@theia/ai-core';
import { nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CODER_REPLACE_PROMPT_TEMPLATE_ID, getCoderReplacePromptTemplate } from '../common/coder-replace-prompt-template';
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID } from '../common/workspace-functions';
import { WriteChangeToFileProvider } from './file-changeset-functions';

const CoderSummaryPrompt: PromptTemplate = {
    id: 'coder-summary',
    template: 'Review our conversation and generate a concise summary that captures every crucial detail, \
including all requirements, decisions, and pending tasks. \
Ensure that the summary is sufficiently comprehensive to allow seamless continuation of the workflow. \
Ignore all \'coder_newTask\' and  \'coder_newTaskFromCurrent\' texts. \
Ignore the system prompt. \
Instead of \'Summary\' write \'Current Task\'.'
};

@injectable()
export class CoderAgent extends AbstractStreamParsingChatAgent {
    id: string = 'Coder';
    name = 'Coder';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/coderAgent/description',
        'An AI assistant integrated into Theia IDE, designed to assist software developers. This agent can access the users workspace, it can get a list of all available files \
        and folders and retrieve their content. Futhermore, it can suggest modifications of files to the user. It can therefore assist the user with coding tasks or other \
        tasks involving file changes.');
    override promptTemplates = [
        getCoderReplacePromptTemplate(true),
        getCoderReplacePromptTemplate(false),
        CoderSummaryPrompt
    ];
    override functions = [GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID, WriteChangeToFileProvider.ID];
    protected override systemPromptId: string | undefined = CODER_REPLACE_PROMPT_TEMPLATE_ID;

    @inject(ChatService) protected readonly chatService: ChatService;

    protected override async onResponseComplete(request: MutableChatRequestModel): Promise<void> {
        request.response.response.addContent(
            new CommandChatResponseContentImpl({ id: 'coder_newTask' }, {
                label: 'Start new Task', callback: async () => {
                    this.chatService.createSession(request.session.location, { focus: true }, this);
                }
            })
        );
        request.response.response.addContent(
            new CommandChatResponseContentImpl({ id: 'coder_newTaskFromCurrent' }, {
                label: 'Start new Task from current', callback: async () => {
                    // in order to do a silent request we would need to use this.callLlm directly
                    const summaryPrompt = await this.promptService.getPrompt(CoderSummaryPrompt.id);
                    if (summaryPrompt) {
                        const result = await this.chatService.sendRequest(request.session.id, { text: summaryPrompt.text });
                        const model = await result?.responseCompleted;
                        // await this.invoke(request);
                        const content = model?.response.content ?? [];
                        const summaryContent = content[content.length - 3];
                        const summary = summaryContent.asString?.() ?? '';

                        const session = this.chatService.createSession(request.session.location, { focus: true }, this);
                        this.chatService.sendRequest(session.id, { text: summary });
                    }
                }
            })
        );
        await super.onResponseComplete(request);
    }
}
