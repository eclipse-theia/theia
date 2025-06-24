// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { CommonCommands, codicon } from '@theia/core/lib/browser';
import { AICommandHandlerFactory } from './ai-command-handler-factory';
import { injectable, inject } from '@theia/core/shared/inversify';

export const AI_SHOW_SETTINGS_COMMAND: Command = Command.toLocalizedCommand({
    id: 'ai-chat-ui.show-settings',
    label: 'Show AI Settings',
    iconClass: codicon('settings-gear'),
});

@injectable()
export class AiCoreCommandContribution implements CommandContribution {
    @inject(AICommandHandlerFactory) protected readonly handlerFactory: AICommandHandlerFactory;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(AI_SHOW_SETTINGS_COMMAND, this.handlerFactory({
            execute: () => commands.executeCommand(CommonCommands.OPEN_PREFERENCES.id, 'ai-features'),
        }));
    }
}
