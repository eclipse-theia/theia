// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
} from '@theia/ai-chat';
import { Agent, BasePromptFragment } from '@theia/ai-core';
import { injectable, interfaces } from '@theia/core/shared/inversify';

export function bindJudgeChatAgentContribution(bind: interfaces.Bind): void {
    bind(JudgeChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(JudgeChatAgent);
    bind(ChatAgent).toService(JudgeChatAgent);
}

const systemPrompt: BasePromptFragment = {
    id: 'judge-system',
    template: `You are an evaluation judge for an AI coding assistant integrated into the Eclipse Theia IDE.

Your job is to evaluate how well the assistant responded to a given task. You will receive:
- The original task prompt
- The expected behavior criteria
- The assistant's response (including any tool calls it made)

Evaluate the response on these criteria:
- **Correctness**: Does the response correctly address the task?
- **Code quality**: Is the generated code syntactically correct, well-structured, and following good practices?
- **Completeness**: Does the response cover all aspects of the expected behavior?
- **Relevance**: Does the response stay focused on the task without unnecessary tangents?
- **Tool usage**: Were tool calls appropriate, efficient, and non-repetitive?

Return ONLY valid JSON with no surrounding text, markdown, or code blocks:
{"score": <1-10>, "pass": <true if score >= 6>, "reasoning": "<2-3 sentences explaining the score>", "issues": ["<issue1>", "<issue2>"]}`
};

@injectable()
export class JudgeChatAgent extends AbstractStreamParsingChatAgent {
    id = 'Judge';
    name = 'Judge';
    override description = 'Evaluates AI assistant responses for quality, correctness, and tool usage.';
    protected defaultLanguageModelPurpose = 'chat';
    override languageModelRequirements = [
        {
            purpose: 'chat',
            identifier: 'default/universal',
        }
    ];
    override prompts = [{ id: systemPrompt.id, defaultVariant: systemPrompt }];
    protected override systemPromptId: string | undefined = systemPrompt.id;
    override iconClass: string = 'codicon codicon-check-all';
    override functions: string[] = [];
}
