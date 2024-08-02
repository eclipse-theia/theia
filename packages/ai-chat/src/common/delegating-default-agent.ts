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

import { getJsonOfResponse, LanguageModel, LanguageModelRequirement } from '@theia/ai-core';
import {
    PromptTemplate
} from '@theia/ai-core/lib/common';
import { injectable } from '@theia/core/shared/inversify';
import { ChatAgentService } from './chat-agent-service';
import { AbstractStreamParsingChatAgent } from './chat-agents';
import { ChatRequestModelImpl } from './chat-model';

export const defaultTemplate: PromptTemplate = {
    id: 'default-template',
    template: `# Instructions

You are an AI assistant integrated into the Theia IDE, specifically designed to help software developers by
providing concise and accurate answers to programming-related questions. Your role is to enhance the
developer's productivity by offering quick solutions, explanations, and best practices.
Keep responses short and to the point, focusing on delivering valuable insights, best practices and
simple solutions.

### Guidelines

1. **Understand Context:**
   - Assess the context of the code or issue when available.
   - Tailor responses to be relevant to the programming language, framework, or tools like Eclipse Theia.
   - Ask clarifying questions if necessary to provide accurate assistance.

2. **Provide Clear Solutions:**
   - Offer direct answers or code snippets that solve the problem or clarify the concept.
   - Avoid lengthy explanations unless necessary for understanding.

3. **Promote Best Practices:**
   - Suggest best practices and common patterns relevant to the question.
   - Provide links to official documentation for further reading when applicable.

4. **Support Multiple Languages and Tools:**
   - Be familiar with popular programming languages, frameworks, IDEs like Eclipse Theia, and command-line tools.
   - Adapt advice based on the language, environment, or tools specified by the developer.

5. **Facilitate Learning:**
   - Encourage learning by explaining why a solution works or why a particular approach is recommended.
   - Keep explanations concise and educational.

6. **Maintain Professional Tone:**
   - Communicate in a friendly, professional manner.
   - Use technical jargon appropriately, ensuring clarity for the target audience.

7. **Stay on Topic:**
   - Limit responses strictly to topics related to software development, frameworks, Eclipse Theia, terminal usage, and relevant technologies.
   - Politely decline to answer questions unrelated to these areas by saying, "I'm here to assist with programming-related questions.
     For other topics, please refer to a specialized source."

### Example Interactions

- **Question:** "What's the difference between \`let\` and \`var\` in JavaScript?"
  **Answer:** "\`let\` is block-scoped, while \`var\` is function-scoped. Prefer \`let\` to avoid scope-related bugs."

- **Question:** "How do I handle exceptions in Java?"
  **Answer:** "Use try-catch blocks: \`\`\`java try { /* code */ } catch (ExceptionType e) { /* handle exception */ }\`\`\`."

- **Question:** "What is the capital of France?"
  **Answer:** "I'm here to assist with programming-related queries. For other topics, please refer to a specialized source."
`
};

export const delegateTemplate: PromptTemplate = {
    id: 'default-delegate-template',
    template: `# Instructions

Your task is to identify which Chat Agent(s) should best reply a given user's message.
You consider all messages of the conversation to ensure consistency and avoid agent switches without a clear context change.
You should select the best Chat Agent based on the name and description of the agents, matching them to the user message.

## Constraints

Your response must be a JSON array containing the id(s) of the selected Chat Agent(s).

* Do not use ids that are not provided in the list below.
* Do not include any additional information, explanations, or questions for the user.
* If there is no suitable choice, pick the \`DefaultChatAgent\`.
* If there are multiple good choices, select those that are most specific and include them all.

Unless there is a more specific agent available, select the \`DefaultChatAgent\`, especially for general programming-related questions.
You must only use the \`id\` attribute of the agent, never the name.

## List of Currently Available Chat Agents

\${agents}

`
};

@injectable()
export class DelegatingDefaultChatAgent extends AbstractStreamParsingChatAgent {

    id: string = 'DefaultChatAgent';
    name: string = 'DefaultChatAgent';
    description: string = 'The default chat agent capable of answering all general programming-related questions.';
    variables: string[] = [];
    promptTemplates: PromptTemplate[] = [defaultTemplate, delegateTemplate];
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'openai/gpt-4o',
    }, {
        purpose: 'agent-selection',
        identifier: 'openai/gpt-4o-mini',
    }];

    protected override languageModelPurpose = 'chat';

    override async invoke(request: ChatRequestModelImpl, chatAgentService?: ChatAgentService): Promise<void> {
        // check if we should better delegate to a different chat agent
        let didDelegate = false;
        const bestChatAgentIds = await this.selectChatAgent(request);
        for (const agentId of bestChatAgentIds.filter(id => id !== this.id)) {
            const delegateAgent = chatAgentService?.getAgent(agentId);
            if (delegateAgent) {
                request.addDelegate(delegateAgent.id);
                didDelegate = true;
                await delegateAgent.invoke(request, chatAgentService);
            } else {
                console.warn(`Chat Agent with id ${agentId} is not registered`);
            }
        }

        if (didDelegate) {
            return new Promise<void>(resolve => {
                request.response.onDidChange(() => {
                    if (request.response.isComplete) {
                        resolve();
                    }
                });
            });
        }

        return super.invoke(request);
    }

    protected async getAgentSelectionLanguageModel(): Promise<LanguageModel> {
        return this.selectLanguageModel(this.getAgentSelectionLanguageModelSelector());
    }

    protected getAgentSelectionLanguageModelSelector(): LanguageModelRequirement {
        return this.languageModelRequirements.find(req => req.purpose === 'agent-selection')!;
    }

    protected async getSystemMessage(): Promise<string | undefined> {
        return this.promptService.getPrompt(defaultTemplate.id);
    }

    protected async selectChatAgent(request: ChatRequestModelImpl): Promise<string[]> {
        const delegateSystemPrompt = await this.promptService.getPrompt(delegateTemplate.id);
        if (delegateSystemPrompt === undefined) {
            console.warn('No prompt found for delegateTemplate');
            return [this.id];
        }

        const messages = await this.getMessages(request.session, false, () => Promise.resolve(delegateSystemPrompt));

        this.recordingService.recordRequest({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.id,
            request: request.request.text
        });
        const languageModel = await this.getAgentSelectionLanguageModel();
        const languageModelResponse = await languageModel.request({ messages });

        let agentIds;
        try {
            agentIds = await getJsonOfResponse(languageModelResponse) as string[];
        } catch (e) {
            agentIds = [this.id];
        }

        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId: request.session.id,
            timestamp: Date.now(),
            requestId: request.response.requestId,
            response: agentIds.join(', ')
        });

        return agentIds;
    }
}
