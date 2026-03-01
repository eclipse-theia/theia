// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { Command, CommandRegistry } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';

export interface AiTerminalAssistantCommandService {
    commands: Command[];
    executeCommand(commandId: string, ctx: any): void;
}

export const AiTerminalAssistantCommandService = Symbol('AiTerminalAssistantCommandService');

@injectable()
export class AiTerminalAssistantCommandServiceImpl implements AiTerminalAssistantCommandService {
    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    commands: Command[] = [];

    @postConstruct()
    protected init(): void {
        this.commands = this.getAiTerminalAssistantCommands();
    }

    executeCommand(commandId: string, ctx: any): void {
        this.commandRegistry.executeCommand(commandId, ctx);
    }

    protected getAiTerminalAssistantCommands(): Command[] {
        const commands = this.commandRegistry.commands;
        return commands.filter(command => command.category === 'Ai Terminal Assistant');
    }
}
