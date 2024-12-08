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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';

export const MCP_SERVERS_PREF = 'ai-features.mcp.mcpServers';

export const McpServersPreferenceSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [MCP_SERVERS_PREF]: {
            type: 'object',
            title: 'MCP Servers Configuration',
            markdownDescription: 'Configure MCP servers with command and arguments. Each server is identified by a unique key, such as "sqlite" or "filesystem".\
            To start a server, use the "MCP: Start MCP Server" command, which enables you to select the desired server.\
            To stop a server, use the "MCP: Stop MCP Server" command.\
            \n\
            Example configuration:\n\
            ```\
            {\n\
              "sqlite": {\n\
                "command": "uvx",\n\
                "args": ["mcp-server-sqlite", "--db-path", "/Users/YOUR_USERNAME/test.db"]\n\
              },\n\
              "filesystem": {\n\
                "command": "npx",\n\
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/YOUR_USERNAME/Desktop"]\n\
              }\n\
            }\
            ```',
            additionalProperties: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        title: 'Command to execute the MCP server',
                        markdownDescription: 'The command used to start the MCP server, e.g., "uvx" or "npx".'
                    },
                    args: {
                        type: 'array',
                        title: 'Arguments for the command',
                        markdownDescription: 'An array of arguments to pass to the command.',
                        items: {
                            type: 'string'
                        }
                    }
                },
                required: ['command', 'args']
            }
        }
    }
};
