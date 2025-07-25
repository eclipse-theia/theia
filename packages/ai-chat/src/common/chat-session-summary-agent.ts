// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
    LanguageModelRequirement,
    PromptVariantSet
} from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { AbstractStreamParsingChatAgent, ChatAgent } from './chat-agents';
import { CHAT_SESSION_SUMMARY_PROMPT } from './chat-session-summary-agent-prompt';

@injectable()
export class ChatSessionSummaryAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
    static ID = 'chat-session-summary-agent';
    id = ChatSessionSummaryAgent.ID;
    name = 'Chat Session Summary';
    override description = 'Agent for generating chat session summaries.';
    override variables = [];
    override prompts: PromptVariantSet[] = [CHAT_SESSION_SUMMARY_PROMPT];
    protected readonly defaultLanguageModelPurpose = 'chat-session-summary';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat-session-summary',
        identifier: 'openai/gpt-4o',
    }];
    override agentSpecificVariables = [];
    override functions = [];
    override locations = [];
    override tags = [];
}
