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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core/lib/common';
import { SHELL_EXECUTION_FUNCTION_ID } from '@theia/ai-terminal/lib/common/shell-execution-server';
import { LIST_TASKS_FUNCTION_ID, RUN_TASK_FUNCTION_ID } from '../common/workspace-functions';

@injectable()
export class ShellExecutionCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: 'shell-execution',
            template: this.buildTemplate()
        });
    }

    protected buildTemplate(): string {
        return `## Shell Execution

You have access to the ~{${SHELL_EXECUTION_FUNCTION_ID}} tool, which lets you run arbitrary shell commands on the host system and capture their output.

### When to use shell execution

Use ~{${SHELL_EXECUTION_FUNCTION_ID}} **only when no better-suited tool exists** for the task:

- **Prefer tasks over shell execution** for compiling, building, linting, testing, or any operation that has a corresponding workspace task. \
Always check available tasks with ~{${LIST_TASKS_FUNCTION_ID}} first and run them with ~{${RUN_TASK_FUNCTION_ID}} instead of invoking the build tool directly.
- **Prefer dedicated tools** for file reading, searching, or editing — use the file and search tools provided rather than \`cat\`, \`grep\`, or \`sed\` for workspace files.

Appropriate use cases for ~{${SHELL_EXECUTION_FUNCTION_ID}}:
- Running a command for which no workspace task exists (e.g., a one-off script, \`git\` operations, installing a dependency)
- Efficient bulk operations that are impractical with the file editing tools (e.g., \`sed\`/\`awk\` for mass search-and-replace across many files)
- Querying system or environment information (e.g., checking installed tool versions, environment variables)
- Running scripts (bash, python, node, etc.) that are part of the task

### Important constraints

- **Do not start long-running or blocking processes** (e.g., dev servers, file watchers) with this tool — use launch configurations instead.
- Commands require **user approval** before execution. The user sees the exact command and can approve, deny, or cancel it.
- Output is truncated for large results; use filters (\`grep\`, \`head\`, \`tail\`) to keep output focused.`;
    }
}
