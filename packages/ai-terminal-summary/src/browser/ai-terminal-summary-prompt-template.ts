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

import { PromptVariantSet } from '@theia/ai-core';

export const terminalPrompts: PromptVariantSet[] = [
  {
    id: 'terminal-summary-system',
    defaultVariant: {
      id: 'terminal-summary-system-default',
      template: `{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).
Made improvements or adaptations to this prompt template? We’d love for you to share it with the community! Contribute back here:
https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}
# Instructions
Generate a short command summary of the last terminal command and output, based on the provided terminal contents,
considering the shell and the current working directory.
Focus on the result of exactly the last command executed and provide an indicator if the command was executed successfully.
Summarize the output in a concise manner, highlighting key information and outcomes.

Parameters:
- recent-terminal-contents: The last 0 to 50 recent lines visible in the terminal.
- shell: The shell being used, e.g., /usr/bin/zsh.
- cwd: The current working directory.

Return the result in the following JSON format:
{
  "summary"
}

## Examples

### Command Output Exmample
recent-terminal-contents:
git status
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
shell: "/usr/bin/zsh"
cwd: "/home/user/project"

## Expected JSON output
\`\`\`json
\{
  "summary": "The last command 'git status' was executed successfully.
  You are on the 'main' branch, which is up to date with 'origin/main',
  and there are no changes to commit as the working tree is clean."
}
\`\`\`

### Command Output Exmample
recent-terminal-contents:
git status
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
shell: "/usr/bin/zsh"
cwd: "/home/user/project"

## Expected JSON output
\`\`\`json
\{
  "summary": "The last command 'git status' was executed successfully.
  You are on the 'main' branch, which is up to date with 'origin/main',
  and there are no changes to commit as the working tree is clean."
}
\`\`\`

`
    }
  },
  {
    id: 'terminal-summary-user',
    defaultVariant: {
      id: 'terminal-summary-user-default',
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
  }
];
