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

import {
    ChatAgent,
    AbstractStreamParsingChatAgent,
    SystemMessageDescription
} from './chat-agents';

import { injectable } from '@theia/core/shared/inversify';
import { AgentSpecificVariables, PromptTemplate } from '@theia/ai-core';

@injectable()
export class O1ChatAgent extends AbstractStreamParsingChatAgent implements ChatAgent {

    public name = 'O1-Preview';
    public description = 'An agent for interacting with ChatGPT o1-preview';
    public promptTemplates: PromptTemplate[] = [];
    readonly agentSpecificVariables: AgentSpecificVariables[] = [];
    readonly variables: string[] = [];
    readonly functions: string[] = [];

    constructor() {
        super(
            'o1-preview',
            [{
                purpose: 'chat',
                identifier: 'openai/o1-preview',
            }],
            'chat'
        );
    }

    protected async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        // O1 currently does not support system prompts
        return undefined;
    }
}
