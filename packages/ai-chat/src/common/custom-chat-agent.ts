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

import { AgentSpecificVariables, PromptTemplate } from '@theia/ai-core';
import { AbstractStreamParsingChatAgent, ChatAgent, SystemMessageDescription } from './chat-agents';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class CustomChatAgent
    extends AbstractStreamParsingChatAgent
    implements ChatAgent {
    name: string;
    description: string;
    readonly variables: string[] = [];
    readonly functions: string[] = [];
    readonly promptTemplates: PromptTemplate[] = [];
    readonly agentSpecificVariables: AgentSpecificVariables[] = [];

    constructor(
    ) {
        super('CustomChatAgent', [{ purpose: 'chat' }], 'chat');
    }
    protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        const resolvedPrompt = await this.promptService.getPrompt(`${this.name}_prompt`);
        return resolvedPrompt ? SystemMessageDescription.fromResolvedPromptTemplate(resolvedPrompt) : undefined;
    }

    set prompt(prompt: string) {
        this.promptTemplates.push({ id: `${this.name}_prompt`, template: prompt });
    }
}
