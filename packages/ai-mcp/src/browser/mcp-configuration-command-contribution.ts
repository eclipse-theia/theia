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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MCPServerEditor } from './mcp-server-editor';

/**
 * Public command id for opening the "Add MCP Server" dialog. Exposed as a string
 * so consumers (e.g. `@theia/ai-registry`) can trigger it without depending on
 * `@theia/ai-mcp`'s implementation details.
 */
export const ADD_MCP_SERVER_COMMAND: Command = Command.toLocalizedCommand({
    id: 'aiConfiguration.mcp.addServer',
    label: 'Add local MCP config...',
    category: 'AI'
}, 'theia/ai/mcpConfiguration/command/addServer');

@injectable()
export class MCPConfigurationCommandContribution implements CommandContribution {

    @inject(MCPServerEditor)
    protected readonly editor: MCPServerEditor;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ADD_MCP_SERVER_COMMAND, {
            execute: () => this.editor.openAddServer()
        });
    }
}
