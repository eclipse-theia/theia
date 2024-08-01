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

import { ChatResponsePartRenderer } from '../types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, isCommandChatResponseContent, CommandChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { CommandRegistry, CommandService } from '@theia/core';
import { AIChatCommandArguments } from '../ai-chat-command-contribution';

@injectable()
export class CommandPartRenderer implements ChatResponsePartRenderer<CommandChatResponseContent> {
    @inject(CommandService) private commandService: CommandService;
    @inject(CommandRegistry) private commandRegistry: CommandRegistry;
    canHandle(response: ChatResponseContent): number {
        if (isCommandChatResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    render(response: CommandChatResponseContent): ReactNode {
        const label =
            response.command.label ??
            response.command.id
                .split('-')
                .map(s => s[0].toUpperCase() + s.substring(1))
                .join(' ');
        const arg: AIChatCommandArguments = {
            command: response.command,
            handler: response.commandHandler,
            arguments: response.arguments
        };
        const isCommandEnabled = this.commandRegistry.isEnabled(arg.command.id);
        return (
            isCommandEnabled ? (
                <button className='theia-button main' onClick={this.onCommand.bind(this, arg)}>{label}</button>
            ) : (
                <div>The command has the id "{arg.command.id}" but it is not executable globally from the Chat window.</div>
            )
        );
    }
    private onCommand(arg: AIChatCommandArguments): void {
        this.commandService.executeCommand(arg.command.id, ...(arg.arguments ?? [])).catch(e => { console.error(e); });
    }
}
