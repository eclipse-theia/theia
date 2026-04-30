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

import { AbstractStreamParsingChatAgent } from '@theia/ai-chat';
import { LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { PR_REVIEW_SYSTEM_PROMPT_ID, prReviewSystemPrompt } from './pr-review-prompt-template';

export const PRReviewAgentId = 'pr-reviewer';

@injectable()
export class PRReviewAgent extends AbstractStreamParsingChatAgent {
    id = PRReviewAgentId;
    name = 'PR Reviewer';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/code',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';
    override description = nls.localize('theia/ai/ide/prReviewAgent/description',
        'An AI-powered PR review agent that orchestrates a full code review workflow: fetches PR info, explores the codebase, ' +
        'performs structured analysis, interactively walks the user through findings with diff viewers, and optionally creates a pending review on GitHub.');

    override iconClass: string = 'codicon codicon-git-pull-request-go-to-changes';
    override prompts = [{ id: PR_REVIEW_SYSTEM_PROMPT_ID, defaultVariant: prReviewSystemPrompt, variants: [] }];
    protected override systemPromptId: string = PR_REVIEW_SYSTEM_PROMPT_ID;
    override tags: string[] = [...this.tags, 'Alpha'];
}
