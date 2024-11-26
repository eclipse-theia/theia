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
    ChatMessage,
    ChatModel,
    ChatRequestModelImpl,
    lastProgressMessage,
    QuestionResponseContentImpl,
    SystemMessageDescription,
    unansweredQuestions
} from '@theia/ai-chat';
import { Agent, PromptTemplate } from '@theia/ai-core';
import { injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';

export function bindAskAndContinueChatAgentContribution(bind: interfaces.Bind): void {
    bind(AskAndContinueChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(AskAndContinueChatAgent);
    bind(ChatAgent).toService(AskAndContinueChatAgent);
}

const systemPrompt: PromptTemplate = {
    id: 'askAndContinue-system',
    template: `
You are an agent demonstrating on how to generate questions and continuing the conversation based on the user's answers.

First answer the user's question or continue their story.
Then come up with an interesting question and 2-3 answers which will be presented to the user as multiple choice.

Use the following format exactly to define the questions and answers.
Especially add the <question> and </question> tags around the JSON.

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

Examples:

<question>
{
    "question": "What is the capital of France?",
    "options": [
        {
            "text": "Paris"
        },
        {
            "text": "Lyon"
        }
    ]
}
</question>

<question>
{
    "question": "What does the fox say?",
    "options": [
        {
            "text": "Ring-ding-ding-ding-dingeringeding!"
        },
        {
            "text": "Wa-pa-pa-pa-pa-pa-pow!"
        }
    ]
}
</question>

The user will answer the question and you can continue the conversation.
Once they answered, the question will be replaced with a simple "Question/Answer" pair, for example

Question: What does the fox say?
Answer: Ring-ding-ding-ding-dingeringeding!

If the user did not answer the question, it will be marked with "No answer", for example

Question: What is the capital of France?
No answer

Do not generate such pairs yourself, instead treat them as a signal for a past question.
Do not ask further questions once the text contains 5 or more "Question/Answer" pairs.
`
};

/**
 * This is a very simple example agent that asks questions and continues the conversation based on the user's answers.
 */
@injectable()
export class AskAndContinueChatAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
    override id = 'AskAndContinue';
    readonly name = 'AskAndContinue';
    override defaultLanguageModelPurpose = 'chat';
    readonly description = 'This chat will ask questions related to the input and continues after that.';
    readonly variables = [];
    readonly agentSpecificVariables = [];
    readonly functions = [];

    @postConstruct()
    addContentMatchers(): void {
        this.contentMatchers.push({
            start: /^<question>.*$/m,
            end: /^<\/question>$/m,
            contentFactory: (content: string, request: ChatRequestModelImpl) => {
                const question = content.replace(/^<question>\n|<\/question>$/g, '');
                const parsedQuestion = JSON.parse(question);
                return new QuestionResponseContentImpl(parsedQuestion.question, parsedQuestion.options, request, selectedOption => {
                    this.handleAnswer(selectedOption, request);
                });
            }
        });
    }

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
        request.response.stopWaitingForInput();
        // We're reusing the original request here as a shortcut. In combination with the override of 'getMessages' we continue generating.
        // In a real-world scenario, you would likely manually interact with an LLM here to generate and append the next response.
        this.invoke(request);
    }

    /**
     * As the question/answer are handled within the same response, we add an additional user message at the end to indicate to
     * the LLM to continue generating.
     */
    protected override async getMessages(model: ChatModel): Promise<ChatMessage[]> {
        const messages = await super.getMessages(model, true);
        const requests = model.getRequests();
        if (!requests[requests.length - 1].response.isComplete && requests[requests.length - 1].response.response?.content.length > 0) {
            return [...messages,
            {
                type: 'text',
                actor: 'user',
                query: 'Continue generating based on the user\'s answer or finish the conversation if 5 or more questions were already answered.'
            }];
        }
        return messages;
    }
}

