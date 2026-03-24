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
import { nls, PreferenceService } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PREFERENCE_NAME_AGENT_MODE_CONFIRMED } from '../common/ai-ide-preferences';

export const AgentModeConfirmationService = Symbol('AgentModeConfirmationService');
export interface AgentModeConfirmationService {
    isAcknowledged(): boolean;
    requestConfirmation(request: MutableChatRequestModel): Promise<boolean>;
}

@injectable()
export class AgentModeConfirmationServiceImpl implements AgentModeConfirmationService {

    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    isAcknowledged(): boolean {
        return !!this.preferenceService.get<boolean>(PREFERENCE_NAME_AGENT_MODE_CONFIRMED, false);
    }

    async requestConfirmation(request: MutableChatRequestModel): Promise<boolean> {
        const deferred = new Deferred<boolean>();

        const confirmLabel = nls.localize('theia/ai/ide/agentModeConfirmation/confirm', 'Confirm');
        const cancelLabel = nls.localizeByDefault('Cancel');

        request.response.response.addContent(new MarkdownChatResponseContentImpl(
            nls.localize('theia/ai/ide/agentModeConfirmation/msg',
                'This agent uses an **agentic mode**. To enable autonomous flow, it is capable of directly writing to your workspace files without further confirmation.\n\n'
                + 'It is recommended to use version control (e.g. Git) so you can review and revert changes.\n\n'
                + 'You can switch to **Edit Mode** using the mode selector in the chat input area below, '
                + 'or use the **Architect** agent for read-only planning.\n\n'
                + 'This confirmation is saved for this workspace and won\'t be shown again. '
                + 'To reset or configure it globally, look for `ai-features.agentMode.confirmed` in the Settings.')
        ));

        request.response.response.addContent(new QuestionResponseContentImpl(
            nls.localize('theia/ai/ide/agentModeConfirmation/question', 'Do you want to proceed with Agent Mode?'),
            [{ text: confirmLabel }, { text: cancelLabel }],
            request,
            async selectedOption => {
                if (selectedOption.text === confirmLabel) {
                    await this.preferenceService.set(PREFERENCE_NAME_AGENT_MODE_CONFIRMED, true);
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
            if (result) {
                request.response.response.clearContent();
            }
            return result;
        });
    }
}
