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

import { MutableChatRequestModel } from '@theia/ai-chat';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { SUGGEST_TERMINAL_COMMAND_ID } from '../common/ai-terminal-functions';

@injectable()
export class SuggestTerminalCommand implements ToolProvider {
    static ID = SUGGEST_TERMINAL_COMMAND_ID;

    @inject(TerminalService)
    terminalService: TerminalService;

    getTool(): ToolRequest {
        return {
            id: SuggestTerminalCommand.ID,
            name: SuggestTerminalCommand.ID,
            description: `Proposes executing a command in the terminal. This tool will automatically write the command into the terminal buffer.\n
            Execution of the command is up to the user.`,
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: `The content of the command to write to the terminal buffer.\n
                        ALWAYS provide the COMPLETE intended content of the command, without any truncation or omissions.\n
                        You MUST include ALL parts of the command.`
                    }
                },
                required: ['command']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                if (!this.terminalService.currentTerminal) {
                    return JSON.stringify({ error: 'No open terminal. The user has to have an open terminal for this function to work.' });
                }
                const { command } = JSON.parse(args);
                // Clear current input line, then insert the command
                this.terminalService.currentTerminal?.sendText('\x01\x0b');
                this.terminalService.currentTerminal?.sendText(command);

                return `Proposed executing the terminal command ${command}. The user will review and potentially execute the command.`;
            }
        };
    }

}

