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
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ContributionProvider, ILogger } from '@theia/core';
import { ChatRequestModelImpl } from './chat-model';
import { ChatAgent } from './chat-agents';

export const AgentDispatcher = Symbol('AgentDispatcher');
export interface AgentDispatcher {
    performRequest(request: ChatRequestModelImpl): Promise<void>;
}

@injectable()
export class AgentDispatcherImpl implements AgentDispatcher {

    @inject(ContributionProvider) @named(ChatAgent)
    protected readonly agents: ContributionProvider<ChatAgent>;

    @inject(ILogger)
    protected logger: ILogger;

    async performRequest(request: ChatRequestModelImpl): Promise<void> {
        // TODO retrieve differently how to find the right agent to use
        return this.agents.getContributions()[0].invoke(request);
    }
}
