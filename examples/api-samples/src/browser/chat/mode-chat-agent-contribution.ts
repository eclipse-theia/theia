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
    AbstractStreamParsingChatAgent,
    ChatAgent,
    MutableChatRequestModel,
    MarkdownChatResponseContentImpl,
    SystemMessageDescription
} from '@theia/ai-chat';
import { Agent, LanguageModelRequirement } from '@theia/ai-core';
import { injectable, interfaces } from '@theia/core/shared/inversify';

export function bindModeChatAgentContribution(bind: interfaces.Bind): void {
    bind(ModeChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ModeChatAgent);
    bind(ChatAgent).toService(ModeChatAgent);
}

/**
 * This is a test agent demonstrating how to use chat modes.
 * It responds differently based on the selected mode.
 */
@injectable()
export class ModeChatAgent extends AbstractStreamParsingChatAgent {
    readonly id = 'ModeTestSample';
    readonly name = 'ModeTestSample';
    readonly defaultLanguageModelPurpose = 'chat';
    override readonly description = 'A test agent that demonstrates different response modes (concise vs detailed).';
    override languageModelRequirements: LanguageModelRequirement[] = [];

    // Define the modes this agent supports
    modes = [
        { id: 'concise', name: 'Concise' },
        { id: 'detailed', name: 'Detailed' }
    ];

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        const modeId = request.request.modeId || 'concise';
        const question = request.request.text;

        let response: string;
        if (modeId === 'concise') {
            response = `**Concise Mode**: You asked: "${question}"\n\nThis is a brief response.`;
        } else {
            response = `**Detailed Mode**: You asked: "${question}"\n\n` +
                'This is a more detailed response that provides additional context and explanation. ' +
                'In detailed mode, the agent provides more comprehensive information, examples, and background. ' +
                'This mode is useful when you need in-depth understanding of a topic.';
        }

        request.response.response.addContent(new MarkdownChatResponseContentImpl(response));
        request.response.complete();
    }

    protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        return undefined;
    }
}
