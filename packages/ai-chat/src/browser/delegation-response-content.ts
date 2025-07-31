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
import { isObject } from '@theia/core';
import { ChatRequestInvocation, ChatResponseContent } from '../common';

/**
 * Response Content created when an Agent delegates a prompt to another agent.
 * Contains agent id, delegated prompt, and the response.
 */
export class DelegationResponseContent implements ChatResponseContent {
    kind = 'AgentDelegation';

    responseText: string | undefined;

    /**
     * @param agentId The id of the agent to whom the task was delegated
     * @param prompt The prompt that was delegated
     * @param response The response from the delegated agent
     */
    constructor(
        public agentId: string,
        public prompt: string,
        public response: ChatRequestInvocation
    ) {
        this.handleResponseComplete();
    }

    // Wait for the response to be complete, then extract the response
    // text (for use in asString()).
    async handleResponseComplete(): Promise<void> {
        const completeResponse = await this.response.responseCompleted;
        this.responseText = completeResponse.response.asString();
    }

    asString(): string {
        const json = {
            agentId: this.agentId,
            prompt: this.prompt,
            response: this.responseText ?? ''
        };
        return JSON.stringify(json);
    }
}

export function isDelegationResponseContent(
    value: unknown
): value is DelegationResponseContent {
    return (
        isObject<DelegationResponseContent>(value) &&
        value.kind === 'AgentDelegation'
    );
}
