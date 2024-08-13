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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, CommandChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { CommandRegistry, CommandService } from '@theia/core';

@injectable()
export class CommandPartRenderer implements ChatResponsePartRenderer<CommandChatResponseContent> {
    @inject(CommandService) private commandService: CommandService;
    @inject(CommandRegistry) private commandRegistry: CommandRegistry;
    canHandle(response: ChatResponseContent): number {
        if (CommandChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }
    render(response: CommandChatResponseContent): ReactNode {
        const label =
            response.customCallback?.label ??
            response.command?.label ??
            response.command?.id
                .split('-')
                .map(s => s[0].toUpperCase() + s.substring(1))
                .join(' ') ?? 'Execute';
        if (!response.customCallback && response.command) {
            const isCommandEnabled = this.commandRegistry.isEnabled(response.command.id);
            if (!isCommandEnabled) {
                return <div>The command has the id "{response.command.id}" but it is not executable from the Chat window.</div>;

            }
        }
        return <button className='theia-button main' onClick={this.onCommand.bind(this, response)}>{label}</button>;
    }
    private onCommand(arg: CommandChatResponseContent): void {
        if (arg.customCallback) {
            arg.customCallback.callback().catch(e => { console.error(e); });
        } else if (arg.command) {
            this.commandService.executeCommand(arg.command.id, ...(arg.arguments ?? [])).catch(e => { console.error(e); });
        } else {
            console.warn('No command or custom callback provided in command chat response content');
        }
    }
}
