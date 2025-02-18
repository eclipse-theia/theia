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

import { nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';

export const MCP_SERVERS_PREF = 'ai-features.mcp.mcpServers';

export const McpServersPreferenceSchema: PreferenceSchema = {
  type: 'object',
  properties: {
    [MCP_SERVERS_PREF]: {
      type: 'object',
      title: nls.localize('theia/ai/mcp/servers/title', 'MCP Servers Configuration'),
      markdownDescription: nls.localize('theia/ai/mcp/servers/mdDescription', 'Configure MCP servers with command, arguments, optionally environment variables, and autostart \
(true by default). Each server is identified by a unique key, such as "brave-search" or "filesystem". \
To start a server, use the "MCP: Start MCP Server" command, which enables you to select the desired server. \
To stop a server, use the "MCP: Stop MCP Server" command. \
Please note that autostart will only take effect after a restart, you need to start a server manually for the first time.\
\n\
Example configuration:\n\
```\
{\n\
  "brave-search": {\n\
    "command": "npx",\n\
    "args": [\n\
      "-y",\n\
      "@modelcontextprotocol/server-brave-search"\n\
    ],\n\
    "env": {\n\
      "BRAVE_API_KEY": "YOUR_API_KEY"\n\
    },\n\
  },\n\
  "filesystem": {\n\
    "command": "npx",\n\
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/YOUR_USERNAME/Desktop"],\n\
    "env": {\n\
      "CUSTOM_ENV_VAR": "custom-value"\n\
    },\n\
    "autostart": false\n\
  }\n\
}\n```'),
      additionalProperties: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            title: nls.localize('theia/ai/mcp/servers/command/title', 'Command to execute the MCP server'),
            markdownDescription: nls.localize('theia/ai/mcp/servers/command/mdDescription', 'The command used to start the MCP server, e.g., "uvx" or "npx".')
          },
          args: {
            type: 'array',
            title: nls.localize('theia/ai/mcp/servers/args/title', 'Arguments for the command'),
            markdownDescription: nls.localize('theia/ai/mcp/servers/args/mdDescription', 'An array of arguments to pass to the command.'),
          },
          env: {
            type: 'object',
            title: nls.localize('theia/ai/mcp/servers/env/title', 'Environment variables'),
            markdownDescription: nls.localize('theia/ai/mcp/servers/env/mdDescription', 'Optional environment variables to set for the server, such as an API key.'),
            additionalProperties: {
              type: 'string'
            }
          },
          autostart: {
            type: 'boolean',
            title: nls.localize('theia/ai/mcp/servers/autostart/title', 'Autostart'),
            markdownDescription: nls.localize('theia/ai/mcp/servers/autostart/mdDescription',
              'Automatically start this server when the frontend starts. Newly added servers are not immediately auto started, but on restart'),
            default: true
          }
        },
        required: ['command', 'args']
      }
    }
  }
};
