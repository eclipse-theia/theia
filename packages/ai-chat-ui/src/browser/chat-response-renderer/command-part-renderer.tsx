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
import { Command, CommandService } from '@theia/core';

@injectable()
export class CommandPartRenderer implements ChatResponsePartRenderer<CommandChatResponseContent> {
    @inject(CommandService) private commandService: CommandService;
    canHandle(response: ChatResponseContent): number {
        if (isCommandChatResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    render(response: CommandChatResponseContent): ReactNode {
        return <div><button onClick={this.onCommand.bind(this, response.command, response.args)}>Press Me!</button></div>;
    }
    private onCommand(command: Command, args: unknown[]): void {
        this.commandService.executeCommand(command.id, ...args).catch(e => { console.error(e); });
    }

}
