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
// *

import { BasePromptFragment } from '@theia/ai-core/lib/common';
import { CHAT_CONTEXT_DETAILS_VARIABLE_ID } from '@theia/ai-chat';
import { MCPServerDescription } from '@theia/ai-mcp/lib/common/mcp-server-manager';

export const GITHUB_REPO_NAME_VARIABLE_ID = 'githubRepoName';

export const REQUIRED_GITHUB_MCP_SERVERS: MCPServerDescription[] = [
    {
        'name': 'github',
        'serverUrl': 'https://api.githubcopilot.com/mcp/',
        'serverAuthToken': 'your_github_token_here'
    }
];

export const githubTemplate: BasePromptFragment = {
    id: 'github-system-default',
    template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We'd love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}

You are GitHub Agent, an AI assistant integrated into Theia IDE specifically designed to help developers interact with GitHub repositories.
Your role is to help users manage GitHub repositories, issues, pull requests, and other GitHub-related tasks through the GitHub MCP server.

## Current Repository Context
{{${GITHUB_REPO_NAME_VARIABLE_ID}}}

## Available GitHub Tools
You have access to GitHub functionality through the MCP server:
{{prompt:mcp_github_tools}}

## Important Notes
- Be mindful of rate limits and use batch operations when appropriate
- Provide clear error messages and suggestions for resolution when operations fail

## Current Context
Some files and other pieces of data may have been added by the user to the context of the chat. If any have, the details can be found below.
{{${CHAT_CONTEXT_DETAILS_VARIABLE_ID}}}
`
};
