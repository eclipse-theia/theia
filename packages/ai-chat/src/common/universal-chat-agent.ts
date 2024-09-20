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

import { AgentSpecificVariables } from '@theia/ai-core';
import {
   PromptTemplate
} from '@theia/ai-core/lib/common';
import { injectable } from '@theia/core/shared/inversify';
import { AbstractStreamParsingChatAgent, ChatAgent, SystemMessageDescription } from './chat-agents';

export const universalTemplate: PromptTemplate = {
   id: 'universal-system',
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

@injectable()
export class UniversalChatAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
   name: string;
   description: string;
   variables: string[];
   promptTemplates: PromptTemplate[];
   readonly functions: string[];
   readonly agentSpecificVariables: AgentSpecificVariables[];

   constructor() {
      super('Universal', [{
         purpose: 'chat',
         identifier: 'openai/gpt-4o',
      }], 'chat');
      this.name = 'Universal';
      this.description = 'This agent is designed to help software developers by providing concise and accurate '
         + 'answers to general programming and software development questions. It is also the fall-back for any generic '
         + 'questions the user might ask. The universal agent currently does not have any context by default, i.e. it cannot '
         + 'access the current user context or the workspace.';
      this.variables = [];
      this.promptTemplates = [universalTemplate];
      this.functions = [];
      this.agentSpecificVariables = [];
   }

   protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
      const resolvedPrompt = await this.promptService.getPrompt(universalTemplate.id);
      return resolvedPrompt ? SystemMessageDescription.fromResolvedPromptTemplate(resolvedPrompt) : undefined;
   }

}
