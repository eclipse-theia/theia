// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { codeReviewerSystemPrompt, CODE_REVIEWER_SYSTEM_PROMPT_ID } from './code-reviewer-prompt-template';

export const CodeReviewerAgentId = 'code-reviewer';

@injectable()
export class CodeReviewerAgent extends AbstractStreamParsingChatAgent {
    name = 'Code Reviewer';
    id = CodeReviewerAgentId;
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/code',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';
    override description = nls.localize('theia/ai/ide/codeReviewerAgent/description',
        'A code review assistant that analyzes code changes and returns structured verdicts. \
        Checks completion criteria, build/lint/test evidence, and code quality.');

    override prompts = [{ id: CODE_REVIEWER_SYSTEM_PROMPT_ID, defaultVariant: codeReviewerSystemPrompt, variants: [] }];
    protected override systemPromptId: string = CODE_REVIEWER_SYSTEM_PROMPT_ID;
    override iconClass: string = 'codicon codicon-code-review';
}
