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

import { COMMAND_CHAT_RESPONSE_COMMAND } from '@theia/ai-chat/lib/common';
import { Command, CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';

export interface AIChatCommandArguments {
    command: Command;
    handler?: (...commandArgs: unknown[]) => Promise<void>;
    arguments?: unknown[];
}

const COMMAND_DEMO_SAY_HELLO: Command = {
    id: 'theia-ai:greet-command',
    label: 'Say Hello'
};
@injectable()
export class AIChatCommandContribution implements CommandContribution {

    @inject(MessageService)
    private readonly messageService: MessageService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(COMMAND_CHAT_RESPONSE_COMMAND, {
            execute: async (arg: AIChatCommandArguments) => {
                if (arg.handler) {
                    arg.handler();
                } else {
                    console.error(`No handle available which is necessary when using the default command '${COMMAND_CHAT_RESPONSE_COMMAND.id}'.`);
                }
            }
        });
        commands.registerCommand(COMMAND_DEMO_SAY_HELLO, {
            execute: async (arg: string) => {
                this.messageService.info(`Hello ${arg}!`)
            }
        });
    }
}
