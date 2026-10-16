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
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat';
import { LanguageModelRequirement } from '@theia/ai-core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { agentsMdSystemVariants, agentsMdTemplateVariants } from '../common/agents-md-prompt-template';
import { ILogger, nls } from '@theia/core';

@injectable()
export class AgentsMdAgent extends AbstractStreamParsingChatAgent {

    @inject(ILogger) @named('ai-ide:AgentsMdAgent')
    protected override readonly logger: ILogger;

    name = 'AgentsMd';
    id = 'AgentsMd';
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'chat',
        identifier: 'default/fast',
    }];
    protected defaultLanguageModelPurpose: string = 'chat';

    override description = nls.localize('theia/ai/workspace/agentsMdAgent/description',
        'An AI assistant for managing the project context that other AI agents use. This agent helps create, update and review the AGENTS.md file at the root of your ' +
        'workspace, following the open AGENTS.md standard that other agentic tools read as well. It can analyze your workspace to suggest project information, ' +
        'consolidate existing instruction files such as CLAUDE.md or copilot-instructions.md, or update the file based on your requirements.');

    override prompts = [agentsMdSystemVariants, agentsMdTemplateVariants];
    protected override systemPromptId: string | undefined = agentsMdSystemVariants.id;
    override iconClass: string = 'codicon codicon-repo';
}
