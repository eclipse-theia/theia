/* eslint-disable @typescript-eslint/tslint/config */
// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
//
// This file is licensed under the MIT License.
// See LICENSE-MIT.txt in the project root for license information.
// https://opensource.org/license/mit.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { nls } from '@theia/core';

export const terminalPromptTemplates = [
  {
    id: 'terminal-system',
    name: 'AI Terminal System Prompt',
    description: nls.localize('theia/ai/terminal/systemPrompt/description', 'Prompt for the AI Terminal Assistant'),
    template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
# Instructions
Generate one or more command suggestions based on the user's request, considering the shell being used,
the current working directory, and the recent terminal contents. Provide the best suggestion first,
followed by other relevant suggestions if the user asks for further options. 

Parameters:
- user-request: The user's question or request.
- shell: The shell being used, e.g., /usr/bin/zsh.
- cwd: The current working directory.
- recent-terminal-contents: The last 0 to 50 recent lines visible in the terminal.

Return the result in the following JSON format:
{
  "commands": [
    "best_command_suggestion",
    "next_best_command_suggestion",
    "another_command_suggestion"
  ]
}

## Example
user-request: "How do I commit changes?"
shell: "/usr/bin/zsh"
cwd: "/home/user/project"
recent-terminal-contents:
git status
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

## Expected JSON output
\`\`\`json
\{
  "commands": [
    "git commit",
    "git commit --amend",
    "git commit -a"
  ]
}
\`\`\`
`
  },
  {
    id: 'terminal-user',
    name: 'AI Terminal User Prompt',
    description: nls.localize('theia/ai/terminal/userPrompt/description', 'Prompt that contains the user request'),
    template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
user-request: {{userRequest}}
shell: {{shell}}
cwd: {{cwd}}
recent-terminal-contents:
{{recentTerminalContents}}
`
  }
];
