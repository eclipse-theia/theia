// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { AbstractStreamParsingChatAgent, ChatAgent, SystemMessageDescription } from '@theia/ai-chat/lib/common';
import { AgentSpecificVariables, PromptTemplate } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID } from '../common/workspace-functions';
import { CODER_DEFAULT_PROMPT_TEMPLATE_ID, getCoderReplacePromptTemplate } from '../common/coder-replace-prompt-template';
import { WriteChangeToFileProvider } from './file-changeset-functions';

@injectable()
export class CoderAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
    name: string;
    description: string;
    promptTemplates: PromptTemplate[];
    variables: never[];
    readonly agentSpecificVariables: AgentSpecificVariables[];
    readonly functions: string[];

    constructor() {
        super('Coder', [{
            purpose: 'chat',
            identifier: 'openai/gpt-4o',
        }], 'chat');
        this.name = 'Coder';
        this.description = 'An AI assistant integrated into Theia IDE, designed to assist software developers with code tasks.';
        this.promptTemplates = [getCoderReplacePromptTemplate(false), getCoderReplacePromptTemplate(true)];
        this.variables = [];
        this.agentSpecificVariables = [];
        this.functions = [GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID, WriteChangeToFileProvider.ID];
    }

    protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        const resolvedPrompt = await this.promptService.getPrompt(CODER_DEFAULT_PROMPT_TEMPLATE_ID);
        return resolvedPrompt ? SystemMessageDescription.fromResolvedPromptTemplate(resolvedPrompt) : undefined;
    }

}
