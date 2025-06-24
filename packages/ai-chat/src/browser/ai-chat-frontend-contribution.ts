// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { AIContextVariable, AIVariableService } from '@theia/ai-core';
import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatService } from '../common';

export const VARIABLE_ADD_CONTEXT_COMMAND: Command = Command.toLocalizedCommand({
    id: 'add-context-variable',
    label: 'Add context variable'
}, 'theia/ai/chat-ui/addContextVariable');

@injectable()
export class AIChatFrontendContribution implements CommandContribution {
    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;
    @inject(ChatService)
    protected readonly chatService: ChatService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(VARIABLE_ADD_CONTEXT_COMMAND, {
            execute: (...args) => args.length > 1 && this.addContextVariable(args[0], args[1]),
            isVisible: () => false,
        });
    }

    async addContextVariable(variableName: string, arg: string | undefined): Promise<void> {
        const variable = this.variableService.getVariable(variableName);
        if (!variable || !AIContextVariable.is(variable)) {
            return;
        }

        this.chatService.getActiveSession()?.model.context.addVariables({ variable, arg });
    }
}
