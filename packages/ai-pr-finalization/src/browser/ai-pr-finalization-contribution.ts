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
import { ChatService } from '@theia/ai-chat';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AiPRFinalizationAgent } from './ai-pr-finalization-agent';
import { AICommandHandlerFactory, } from '@theia/ai-core/lib/browser';

export const AiPrFinalizationCommand: Command = {
    id: 'ai-pr-finalization:invoke',
    label: 'Invoke AI PR Finalization'
};

@injectable()
export class AiPrFinalizationContribution implements CommandContribution {
    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(AICommandHandlerFactory)
    protected readonly commandHandlerFactory: AICommandHandlerFactory;

    @inject(AiPRFinalizationAgent)
    protected readonly aiPrFinalizationAgent: AiPRFinalizationAgent;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AiPrFinalizationCommand, this.commandHandlerFactory({
            execute: () => {
                this.invokePrFinalization();
            },

        }));
    }

    private invokePrFinalization(): void {
        const sessionId = this.chatService.createSession().id;
        const userMessage = this.aiPrFinalizationAgent.promptTemplates.find(template => template.id === 'ai-pr-finalization:user-prompt');
        this.chatService.sendRequest(sessionId, {
            text: userMessage?.template ?? 'No user prompt found',
        });
    }
}
