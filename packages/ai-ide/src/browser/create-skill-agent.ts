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
import { ChatMode } from '@theia/ai-chat';
import { LanguageModelRequirement } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import {
    createSkillSystemVariants,
    CREATE_SKILL_SYSTEM_PROMPT_TEMPLATE_ID,
    CREATE_SKILL_SYSTEM_DEFAULT_TEMPLATE_ID,
    CREATE_SKILL_SYSTEM_AGENT_MODE_TEMPLATE_ID,
} from '../common/create-skill-prompt-template';
import { AbstractModeAwareChatAgent } from './mode-aware-chat-agent';
import { nls } from '@theia/core';

@injectable()
export class CreateSkillAgent extends AbstractModeAwareChatAgent {

    name = 'CreateSkill';
    id = 'CreateSkill';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/universal',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/createSkillAgent/description',
        'An AI assistant for creating new skills. Skills provide reusable instructions and domain knowledge for AI agents. ' +
        'This agent helps you create well-structured skills in the .prompts/skills directory with proper YAML frontmatter and markdown content.');

    override tags: string[] = [...this.tags, 'Alpha'];

    protected readonly modeDefinitions: Omit<ChatMode, 'isDefault'>[] = [
        {
            id: CREATE_SKILL_SYSTEM_DEFAULT_TEMPLATE_ID,
            name: nls.localize('theia/ai/ide/createSkillAgent/mode/edit', 'Default Mode')
        },
        {
            id: CREATE_SKILL_SYSTEM_AGENT_MODE_TEMPLATE_ID,
            name: nls.localizeByDefault('Agent Mode')
        }
    ];

    override prompts = [createSkillSystemVariants];
    protected override systemPromptId: string | undefined = CREATE_SKILL_SYSTEM_PROMPT_TEMPLATE_ID;

}
