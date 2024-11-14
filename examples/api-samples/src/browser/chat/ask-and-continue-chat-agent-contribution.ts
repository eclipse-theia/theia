// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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
    AbstractStreamParsingChatAgent,
    ChatAgent,
    ChatRequestModelImpl,
    lastProgressMessage,
    QuestionResponseContent,
    SystemMessageDescription,
    unansweredQuestions
} from '@theia/ai-chat';
import { Agent, PromptTemplate } from '@theia/ai-core';
import { injectable, interfaces } from '@theia/core/shared/inversify';

export function bindAskAndContinueChatAgentContribution(bind: interfaces.Bind): void {
    bind(AskAndContinueChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AskAndContinueChatAgent);
    bind(ChatAgent).toService(AskAndContinueChatAgent);
}

const systemPrompt: PromptTemplate = {
    id: 'askAndContinue-system',
    template: `
Whatever the user inputs, you will write one arbitrary sentence and then ask a question with
the following format and two or three options:

<question>
{
    "question": "YOUR QUESTION HERE",
    "options": [
        {
            "text": "OPTION 1"
        },
        {
            "text": "OPTION 2"
        }
    ]
}
</question>
 `
};

@injectable()
export class AskAndContinueChatAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
    override id = 'AskAndContinue';
    readonly name = 'AskAndContinue';
    override defaultLanguageModelPurpose = 'chat';
    readonly description = 'What ever you input, this chat will ask a question and continues after that.';
    readonly variables = [];
    readonly agentSpecificVariables = [];
    readonly functions = [];

    override additionalContentMatchers = [
        {
            start: /^<question>.*$/m,
            end: /^<\/question>$/m,
            contentFactory: (content: string, request: ChatRequestModelImpl) => {
                const question = content.replace(/^<question>\n|<\/question>$/g, '');
                const parsedQuestion = JSON.parse(question);
                return <QuestionResponseContent>{
                    kind: 'question',
                    question: parsedQuestion.question,
                    options: parsedQuestion.options,
                    request,
                    handler: (option, _request) => this.handleAnswer(option, _request)
                };
            }
        }
    ];

    override languageModelRequirements = [
        {
            purpose: 'chat',
            identifier: 'openai/gpt-4o',
        }
    ];

    readonly promptTemplates = [systemPrompt];

    protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        const resolvedPrompt = await this.promptService.getPrompt(systemPrompt.id);
        return resolvedPrompt ? SystemMessageDescription.fromResolvedPromptTemplate(resolvedPrompt) : undefined;
    }

    protected override async onResponseComplete(request: ChatRequestModelImpl): Promise<void> {
        const unansweredQs = unansweredQuestions(request);
        if (unansweredQs.length < 1) {
            return super.onResponseComplete(request);
        }
        request.response.addProgressMessage({ content: 'Waiting for input...', show: 'whileIncomplete' });
        request.response.waitForInput();
    }

    protected handleAnswer(selectedOption: { text: string; value?: string; }, request: ChatRequestModelImpl): void {
        const progressMessage = lastProgressMessage(request);
        if (progressMessage) {
            request.response.updateProgressMessage({ ...progressMessage, show: 'untilFirstContent', status: 'completed' });
        }
        request.response.continue();
        this.invoke(request);
    }
}

