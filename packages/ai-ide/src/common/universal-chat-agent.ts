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

import { LanguageModelRequirement } from '@theia/ai-core/lib/common';
import { injectable } from '@theia/core/shared/inversify';
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import { nls } from '@theia/core';
import { universalTemplate, universalTemplateVariant } from './universal-prompt-template';

export const UniversalChatAgentId = 'Universal';
@injectable()
export class UniversalChatAgent extends AbstractStreamParsingChatAgent {
   id: string = UniversalChatAgentId;
   name = UniversalChatAgentId;
   languageModelRequirements: LanguageModelRequirement[] = [{
      purpose: 'chat',
      identifier: 'openai/gpt-4o',
   }];
   protected defaultLanguageModelPurpose: string = 'chat';
   override description = nls.localize('theia/ai/chat/universal/description', 'This agent is designed to help software developers by providing concise and accurate '
      + 'answers to general programming and software development questions. It is also the fall-back for any generic '
      + 'questions the user might ask. The universal agent currently does not have any context by default, i.e. it cannot '
      + 'access the current user context or the workspace.');

   override prompts = [{ id: 'universal-system', defaultVariant: universalTemplate, variants: [universalTemplateVariant] }];
   protected override systemPromptId: string = 'universal-system';
}
