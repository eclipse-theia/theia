// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    QuestionResponseContentImpl
} from '@theia/ai-chat/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { nls, PreferenceScope, PreferenceService } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PREFERENCE_NAME_AGENT_MODE_ENABLED } from '../common/ai-ide-preferences';

export const AgentModeConfirmationService = Symbol('AgentModeConfirmationService');
export interface AgentModeConfirmationService {
    isAcknowledged(): boolean;
    requestConfirmation(request: MutableChatRequestModel): Promise<boolean>;
}

@injectable()
export class AgentModeConfirmationServiceImpl implements AgentModeConfirmationService {

    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    isAcknowledged(): boolean {
        return !!this.preferenceService.get<boolean>(PREFERENCE_NAME_AGENT_MODE_ENABLED, false);
    }

    async requestConfirmation(request: MutableChatRequestModel): Promise<boolean> {
        const deferred = new Deferred<boolean>();

        const agentModeLabel = nls.localize('theia/ai/ide/agentModeConfirmation/continueAgentMode', 'Continue with Agent Mode');
        const editModeLabel = nls.localize('theia/ai/ide/agentModeConfirmation/continueEditMode', 'Continue with Edit Mode');

        request.response.response.addContent(new MarkdownChatResponseContentImpl(
            nls.localize('theia/ai/ide/agentModeConfirmation/msg',
                'You are about to use **Agent Mode**. In this mode, the agent can **read, create, and modify files** '
                + 'in your workspace autonomously, without asking for confirmation on each change.\n\n'
                + 'We recommend using **version control** (e.g. Git) so you can easily review and revert any changes.\n\n'
                + 'If you prefer more control, you can continue with **Edit Mode** instead, '
                + 'where changes are presented as suggestions for you to apply.\n\n'
                + 'How would you like to proceed?')
        ));

        request.response.response.addContent(new QuestionResponseContentImpl(
            nls.localize('theia/ai/ide/agentModeConfirmation/info',
                'Continuing with Agent Mode saves your confirmation. You can revoke this later again via the `ai-features.agentMode.enabled` setting.\n\n'
                + 'Continuing with Edit Mode changes your default mode to Edit Mode.\n\n'
                + 'You can change modes anytime via the mode selector or in the AI Configuration.'),
            [{ text: agentModeLabel }, { text: editModeLabel }],
            request,
            async selectedOption => {
                if (selectedOption.text === agentModeLabel) {
                    await this.preferenceService.set(PREFERENCE_NAME_AGENT_MODE_ENABLED, true, PreferenceScope.User);
                    request.response.stopWaitingForInput();
                    deferred.resolve(true);
                } else {
                    request.response.stopWaitingForInput();
                    deferred.resolve(false);
                }
            }
        ));

        const progressMessage = request.response.addProgressMessage({
            content: nls.localize('theia/ai/ide/agentModeConfirmation/waiting', 'Waiting for confirmation...'),
            show: 'whileIncomplete'
        });
        request.response.waitForInput();

        return deferred.promise.then(result => {
            request.response.updateProgressMessage({ ...progressMessage, show: 'untilFirstContent', status: 'completed' });
            request.response.response.clearContent();
            return result;
        });
    }
}
