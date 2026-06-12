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

import { AbstractStreamParsingChatAgent, ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import { LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { commitMessagePrompts, COMMIT_MESSAGE_SYSTEM_PROMPT_ID } from './commit-message-prompt-template';

export const COMMIT_MESSAGE_AGENT_ID = 'CommitMessage';

@injectable()
export class CommitMessageAgent extends AbstractStreamParsingChatAgent {

    id = COMMIT_MESSAGE_AGENT_ID;
    name = nls.localize('theia/ai-ide/commitMessageAgent/name', 'Commit Message');

    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/universal',
    }];

    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai-ide/commitMessageAgent/description',
        'Generates git commit messages from staged or all current changes in the workspace repository. ' +
        'Invoked from the SCM commit-message input via the AI sparkle buttons.');

    override prompts = commitMessagePrompts;
    protected override systemPromptId: string | undefined = COMMIT_MESSAGE_SYSTEM_PROMPT_ID;

    override locations: ChatAgentLocation[] = [ChatAgentLocation.Panel];
    override iconClass: string = codicon('sparkle');
}
