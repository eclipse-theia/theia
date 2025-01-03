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
import { AbstractStreamParsingChatAgent, ChatAgent, ChatResponseContent, SystemMessageDescription } from '@theia/ai-chat/lib/common';
import { AgentSpecificVariables, PromptTemplate, ToolInvocationRegistry } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { codheiaTemplate } from '../common/codheia-template';
import { FILE_CONTENT_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID } from '../common/functions';

export class ChangeSetResponseContent implements ChatResponseContent {
    kind: string = 'ChangeSet';
    constructor(public changeSetUUID: string) { }
}

@injectable()
export class CodheiaAgent extends AbstractStreamParsingChatAgent implements ChatAgent {
    name: string;
    description: string;
    promptTemplates: PromptTemplate[];
    variables: never[];
    readonly agentSpecificVariables: AgentSpecificVariables[];
    readonly functions: string[];

    @inject(ToolInvocationRegistry)
    protected toolInvocationRegistry: ToolInvocationRegistry;

    constructor() {
        super('Codheia', [{
            purpose: 'chat',
            identifier: 'openai/gpt-4o',
        }], 'chat');
        this.name = 'Codheia';
        this.description = 'You are an AI assistant integrated into Theia IDE, designed to assist software developers with code tasks.';
        this.promptTemplates = [codheiaTemplate];
        this.variables = [];
        this.agentSpecificVariables = [];
        this.functions = [GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID, GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID];
    }

    protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        const resolvedPrompt = await this.promptService.getPrompt(codheiaTemplate.id);
        return resolvedPrompt ? SystemMessageDescription.fromResolvedPromptTemplate(resolvedPrompt) : undefined;
    }
    // Parsing responses to extract change set UUID
    protected async parseChangeSetUUID(text: string): Promise<{ changeSetUUID: string }> {
        const uuidMatch = text.match(/"changeSetUUID":\s*"(.*?)"/);
        const changeSetUUID = uuidMatch ? uuidMatch[1] : '';
        return { changeSetUUID };
    }

    // Create ChangeSetResponseContent
    protected createChangeSetResponseContent(parsedChangeSet: { changeSetUUID: string }): ChangeSetResponseContent {
        return new ChangeSetResponseContent(parsedChangeSet.changeSetUUID);
    }
}

