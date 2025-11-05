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
Identify if a terminal command was executed or a build was executed.
Focus on the result of exactly the last command or build executed.

When naming the command or project:
- If summarizing a project build/run, derive the project name from the current working directory: use the basename (the last non-empty path segment of 'cwd'). For example, if cwd is '/home/user/project/bar', the project name is 'bar'.

Start the summary with whether the command/build was successful or failed and name the executed command or project name.
Then, if there are errors, provide an array of error details including type, location, description, and fix suggestions.
The type of error should be prefixed with one of the following: Compilation error, Runtime error, or Other error.
The location should specify in which file and line number the error occurred, if available.
The fix should provide a generic solution to resolve the error, without referencing specific project details. 

Parameters:
- recent-terminal-contents: The last 0 to 50 recent lines visible in the terminal.
- shell: The shell being used, e.g., /usr/bin/zsh.
- cwd: The current working directory.

Return the result in the following JSON format.
{
  "isBuildSuccessful": boolean,
  "outputSummary": string,
  "errors": [
    {
      "type": string,
      "location": string,
      "description": string,
      "fix": string
    }
  ]
}

## Examples

### Command Output Example
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
  "isBuildSuccess": true,
  "outputSummary": "The command 'git status' was executed successfully.",
  "errors": []
}
\`\`\`

### Command Output Example
recent-terminal-contents:
echo hello world
shell: "/usr/bin/zsh"
cwd: "/home/user/project"

## Expected JSON output
\`\`\`json
\{
  "isBuildSuccess": true,
  "outputSummary": "The command 'echo hello world' was executed successfully.",
  "errors": []
}
\`\`\`

### Build Output Example (Java run/build)
recent-terminal-contents:
cd '/home/user/project/bar' && '/Users/foo/Library/Java/JavaVirtualMachines/ms-17.0.16/Contents/Home/bin/java' '-agentlib:jdwp=transport=dt_socket,server=n,
suspend=y,address=localhost:64513' '-XX:+ShowCodeDetailsInExceptionMessages' '-cp' '/home/user/project/bar/bin/main' 'de.Client'
shell: "/usr/bin/zsh"
cwd: "/home/user/project/bar"

## Expected JSON output
\`\`\`json
\{
  "isBuildSuccess": true,
  "outputSummary": "Compilation of the project bar was successful.",
  "errors": []
}
\`\`\`

### Build Output Example (Java run/build with output)
recent-terminal-contents:
cd '/home/user/project/bar' && '/Users/foo/Library/Java/JavaVirtualMachines/ms-17.0.16/Contents/Home/bin/java' '-agentlib:jdwp=transport=dt_socket,server=n,
suspend=y,address=localhost:64513' '-XX:+ShowCodeDetailsInExceptionMessages' '-cp' '/home/user/project/bar/bin/main' 'de.Client'
lorem ipsum dolor sit amet 
shell: "/usr/bin/zsh"
cwd: "/home/user/project/bar"

## Expected JSON output
\`\`\`json
\{
  "isBuildSuccess": true,
  "outputSummary": "Compilation of the project bar was successful.",
  "errors": []
}
\`\`\`


### Build Output Example (Java run/build with runtime error)
recent-terminal-contents:
cd '/home/user/project/bar' && '/Users/foo/Library/Java/JavaVirtualMachines/ms-17.0.16/Contents/Home/bin/java' '-agentlib:jdwp=transport=dt_socket,server=n,
suspend=y,address=localhost:64513' '-XX:+ShowCodeDetailsInExceptionMessages' '-cp' '/home/user/project/bar/bin/main' 'de.Client'
Exception in thread "main" java.lang.IndexOutOfBoundsException: Index 8 out of bounds for length 8
        at java.base/jdk.internal.util.Preconditions.outOfBounds(Preconditions.java:64)
        at java.base/jdk.internal.util.Preconditions.outOfBoundsCheckIndex(Preconditions.java:70)
        at java.base/jdk.internal.util.Preconditions.checkIndex(Preconditions.java:266)
        at java.base/java.util.Objects.checkIndex(Objects.java:361)
        at java.base/java.util.ArrayList.get(ArrayList.java:427)
        at de.BubbleSort.performSort(BubbleSort.java:17)
        at de.Context.sort(Context.java:31)
        at de.Client.main(Client.java:41)
shell: "/usr/bin/zsh"
cwd: "/home/user/project/bar"

## Expected JSON output
\`\`\`json
\{
  "isBuildSuccess": false,
  "outputSummary": "Compilation of project bar failed with 1 error.",
  "errors": [
    {
      "type": "Runtime error: IndexOutOfBoundsException",
      "location": "Client.java:41",
      "description": "Index 8 out of bounds for length 8",
      "fix": "Check the index being accessed and ensure it is within the valid range of the array or list."
    }
  ]
}
\`\`\`


### Build Output Example (Java run/build with compilation error)
recent-terminal-contents:
cd '/home/user/project/bar' && '/Users/foo/Library/Java/JavaVirtualMachines/ms-17.0.16/Contents/Home/bin/java' '-agentlib:jdwp=transport=dt_socket,server=n,
suspend=y,address=localhost:64513' '-XX:+ShowCodeDetailsInExceptionMessages' '-cp' '/home/user/project/bar/bin/main' 'de.Client'
Exception in thread "main" java.lang.Error: Unresolved compilation problem: 
        Syntax error, insert ")" to complete Expression

        at de.Policy.configure(Policy.java:22)
        at de.Client.main(Client.java:36)
shell: "/usr/bin/zsh"
cwd: "/home/user/project/bar"

## Expected JSON output
\`\`\`json
\{
  "isBuildSuccess": false,
  "outputSummary": "Compilation of project bar failed with 1 error.",
  "errors": [
    {
      "type": "Compilation error: Syntax error",
      "location": "Client.java:36",
      "description": "Syntax err, insert \")\" to complete Expression",
      "fix": "Check the index being accessed and ensure it is within the valid range of the array or list."
    }
  ]
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
