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

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PromptService } from '../common/prompt-service';
import {
    GENERIC_CAPABILITIES_SKILLS_PROMPT_ID,
    GENERIC_CAPABILITIES_MCP_FUNCTIONS_PROMPT_ID,
    GENERIC_CAPABILITIES_FUNCTIONS_PROMPT_ID,
    GENERIC_CAPABILITIES_PROMPT_FRAGMENTS_PROMPT_ID,
    GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID,
    GENERIC_CAPABILITIES_VARIABLES_PROMPT_ID
} from '../common/capability-utils';
import { AGENT_DELEGATION_FUNCTION_ID } from '../common';

const SKILLS_TEMPLATE = `## Skills
The following skills are available. Evaluate which skills apply to the current context and load applicable skills using getSkillFileContent before proceeding.
{{selected_skills}}`;

const MCP_FUNCTIONS_TEMPLATE = `## MCP Functions
{{selected_mcp_functions}}`;

const FUNCTIONS_TEMPLATE = `## Functions
{{selected_functions}}`;

const PROMPT_FRAGMENTS_TEMPLATE = `## Prompt Fragments
{{selected_prompt_fragments}}`;

const AGENT_DELEGATION_TEMPLATE = `## Agent Delegation
You can use ~{${AGENT_DELEGATION_FUNCTION_ID}} to delegate to the following agents:
{{selected_agent_delegation}}`;

const VARIABLES_TEMPLATE = `## Variables
{{selected_variables}}`;

/**
 * Contribution that registers prompt fragments for each generic capability type.
 * These fragments are dynamically added to agent prompts based on user selections
 * from the chat UI dropdowns.
 */
@injectable()
export class GenericCapabilitiesPromptFragmentContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: GENERIC_CAPABILITIES_SKILLS_PROMPT_ID,
            template: SKILLS_TEMPLATE,
        });
        this.promptService.addBuiltInPromptFragment({
            id: GENERIC_CAPABILITIES_MCP_FUNCTIONS_PROMPT_ID,
            template: MCP_FUNCTIONS_TEMPLATE,
        });
        this.promptService.addBuiltInPromptFragment({
            id: GENERIC_CAPABILITIES_FUNCTIONS_PROMPT_ID,
            template: FUNCTIONS_TEMPLATE,
        });
        this.promptService.addBuiltInPromptFragment({
            id: GENERIC_CAPABILITIES_PROMPT_FRAGMENTS_PROMPT_ID,
            template: PROMPT_FRAGMENTS_TEMPLATE,
        });
        this.promptService.addBuiltInPromptFragment({
            id: GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID,
            template: AGENT_DELEGATION_TEMPLATE,
        });
        this.promptService.addBuiltInPromptFragment({
            id: GENERIC_CAPABILITIES_VARIABLES_PROMPT_ID,
            template: VARIABLES_TEMPLATE,
        });
    }
}
