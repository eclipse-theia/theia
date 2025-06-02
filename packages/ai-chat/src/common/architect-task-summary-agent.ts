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
    LanguageModelResponse,
    PromptVariantSet
} from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { AbstractStreamParsingChatAgent, ChatAgent } from './chat-agents';
import { MutableChatRequestModel } from './chat-model';
import { ARCHITECT_TASK_SUMMARY_PROMPT } from './architect-task-summary-agent-prompt';

@injectable()
export class ArchitectTaskSummaryAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
    static ID = 'ArchitectTaskSummary';
    id = ArchitectTaskSummaryAgent.ID;
    name = 'ArchitectTaskSummary';
    override description = 'Agent for generating a task context for Coder based on chats with Architect.';
    override variables = [];
    override prompts: PromptVariantSet[] = [ARCHITECT_TASK_SUMMARY_PROMPT];
    protected readonly defaultLanguageModelPurpose = 'architect-chat-task-context';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'architect-chat-task-context',
        identifier: 'openai/gpt-4o',
    }];
    override iconClass = 'codicon codicon-bracket';
    override agentSpecificVariables = [];
    override functions = [];
    override tags = ['Architect', 'Task Context'];

    protected override async addContentsToResponse(languageModelResponse: LanguageModelResponse, request: MutableChatRequestModel): Promise<void> {
        return super.addContentsToResponse(languageModelResponse, request);
    }
}
