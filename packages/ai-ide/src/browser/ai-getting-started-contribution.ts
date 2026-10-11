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

import { CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { ChatAgentService } from '@theia/ai-chat/lib/common';
import { DEFAULT_CHAT_AGENT_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { WalkthroughCommands } from '@theia/getting-started/lib/common/walkthrough-commands';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AI_GETTING_STARTED_WALKTHROUGH_ID } from './ai-getting-started-walkthrough';
import { AI_OPEN_GETTING_STARTED_WALKTHROUGH, AI_SET_DEFAULT_CHAT_AGENT } from './ai-getting-started-commands';

/**
 * Opens the AI getting started walkthrough from anywhere - the chat view, the command palette or a menu -
 * without every caller having to know the walkthrough id.
 */
@injectable()
export class AiGettingStartedContribution implements CommandContribution {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ChatAgentService)
    protected readonly chatAgentService: ChatAgentService;

    registerCommands(commands: CommandRegistry): void {
        // Deliberately not gated on the AI features being enabled: this is where they get enabled.
        commands.registerCommand(AI_OPEN_GETTING_STARTED_WALKTHROUGH, {
            execute: () => commands.executeCommand(WalkthroughCommands.OPEN_WALKTHROUGH.id, AI_GETTING_STARTED_WALKTHROUGH_ID)
        });
        commands.registerCommand(AI_SET_DEFAULT_CHAT_AGENT, {
            execute: (agentId: string) => this.setDefaultChatAgent(agentId),
            isEnabled: (agentId: unknown) => typeof agentId === 'string' && !!agentId
        });
    }

    /**
     * Writes the default chat agent preference and says so: the walkthrough offers this as a button, and
     * without the message the only feedback would be the step ticking itself off further up the page.
     */
    protected async setDefaultChatAgent(agentId: string): Promise<void> {
        await this.preferenceService.set(DEFAULT_CHAT_AGENT_PREF, agentId, PreferenceScope.User);
        const label = this.chatAgentService.getAgent(agentId)?.name ?? agentId;
        this.messageService.info(nls.localize('theia/ai/ide/defaultChatAgentSet', 'The default chat agent is now {0}.', label));
    }
}
