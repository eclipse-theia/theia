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
import { exploreSystemPrompt, EXPLORE_SYSTEM_PROMPT_ID } from './explore-prompt-template';

export const ExploreAgentId = 'explore';

@injectable()
export class ExploreAgent extends AbstractStreamParsingChatAgent {
    name = 'Explore';
    id = ExploreAgentId;
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/code',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';
    override description = nls.localize('theia/ai/ide/exploreAgent/description',
        'A codebase exploration assistant that extracts and distills information from the codebase. \
        Reports facts about what exists, provides code excerpts, and describes observed patterns.');

    override prompts = [{ id: EXPLORE_SYSTEM_PROMPT_ID, defaultVariant: exploreSystemPrompt, variants: [] }];
    protected override systemPromptId: string = EXPLORE_SYSTEM_PROMPT_ID;
    override iconClass: string = 'codicon codicon-compass';
}
