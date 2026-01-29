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

import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    SHELL_EXECUTION_FUNCTION_ID,
    ShellExecutionServer,
    ShellExecutionToolResult,
    ShellExecutionCanceledResult,
    combineAndTruncate
} from '../common/shell-execution-server';
import { CancellationToken, generateUuid } from '@theia/core';

@injectable()
export class ShellExecutionTool implements ToolProvider {

    @inject(ShellExecutionServer)
    protected readonly shellServer: ShellExecutionServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected readonly runningExecutions = new Map<string, string>();

    async cancelExecution(toolCallId: string): Promise<boolean> {
        const executionId = this.runningExecutions.get(toolCallId);
        if (executionId) {
            const canceled = await this.shellServer.cancel(executionId);
            if (canceled) {
                this.runningExecutions.delete(toolCallId);
            }
            return canceled;
        }
        return false;
    }

    isExecutionRunning(toolCallId: string): boolean {
        return this.runningExecutions.has(toolCallId);
    }

    getTool(): ToolRequest {
        return {
            id: SHELL_EXECUTION_FUNCTION_ID,
            name: SHELL_EXECUTION_FUNCTION_ID,
            providerName: 'ai-terminal',
            confirmAlwaysAllow: 'This tool has full system access and can execute any command, ' +
                'modify files outside the workspace, and access network resources.',
            description: `Execute a shell command on the host system and return the output.

This tool runs commands in a shell environment (bash on Linux/macOS, cmd/PowerShell on Windows).
Use it for:
- Running build commands (npm, make, gradle, cargo, etc.)
- Executing git commands
- Running tests and linters
- Efficient search with grep, ripgrep, or find
- Bulk search-and-replace operations with sed, awk, or perl
- Reading or modifying files outside the workspace
- Installing dependencies or packages
- System administration and diagnostics
- Running scripts (bash, python, node, etc.)

USER INTERACTION:
- Commands require user approval before execution - the user sees the exact command and can approve or deny
- Once approved, the user may cancel execution at any time while it's running
- Users can configure "Always Allow" to skip confirmations for this tool

It should not be used for "endless" or long-running processes (e.g., servers, watchers) as the execution
will block further tool usage and chat messages until it completes or times out.

OUTPUT TRUNCATION: To keep responses manageable, output is truncated at multiple levels:
- Stream limit: stdout and stderr each capped at 1MB
- Line count: Only first 50 and last 50 lines kept (middle lines omitted)
- Line length: Lines over 1000 chars show start/end with middle omitted
To avoid losing important information, limit output size in your commands:
- Use grep/findstr to filter output (e.g., "npm test 2>&1 | grep -E '(FAIL|PASS|Error)'")
- Use head/tail to limit lines (e.g., "git log --oneline -20")
- Use wc -l to count lines before fetching full output
- Redirect verbose output to /dev/null if not needed

TIMEOUT: Default 2 minutes, max 10 minutes. Specify higher timeout for longer commands.`,
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The shell command to execute. Can include pipes, redirects, and shell features.'
                    },
                    cwd: {
                        type: 'string',
                        description: 'Working directory for command execution. Can be absolute or relative to workspace root. Defaults to the workspace root.'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Timeout in milliseconds. Default: 120000 (2 minutes). Max: 600000 (10 minutes).'
                    }
                },
                required: ['command']
            },
            handler: (argString: string, ctx?: unknown) => this.executeCommand(argString, ctx)
        };
    }

    protected async executeCommand(argString: string, ctx?: unknown): Promise<ShellExecutionToolResult | ShellExecutionCanceledResult> {
        const args: {
            command: string;
            cwd?: string;
            timeout?: number;
        } = JSON.parse(argString);

        // Get workspace root to pass to backend for path resolution
        const rootUri = this.workspaceService.getWorkspaceRootUri(undefined);
        const workspaceRoot = rootUri?.path.fsPath();

        // Generate execution ID and get tool call ID from context
        const executionId = generateUuid();
        const toolCallId = this.extractToolCallId(ctx);
        const cancellationToken = this.extractCancellationToken(ctx);

        // Track this execution
        if (toolCallId) {
            this.runningExecutions.set(toolCallId, executionId);
        }

        const cancellationListener = cancellationToken?.onCancellationRequested(() => {
            this.shellServer.cancel(executionId);
        });

        try {
            // Call the backend service (path resolution happens on the backend)
            const result = await this.shellServer.execute({
                command: args.command,
                cwd: args.cwd,
                workspaceRoot,
                timeout: args.timeout,
                executionId,
            });

            if (result.canceled) {
                return {
                    canceled: true,
                    output: this.combineAndTruncate(result.stdout, result.stderr) || undefined,
                    duration: result.duration,
                };
            }

            // Combine stdout and stderr, apply truncation
            const combinedOutput = this.combineAndTruncate(result.stdout, result.stderr);

            return {
                success: result.success,
                exitCode: result.exitCode,
                output: combinedOutput,
                error: result.error,
                duration: result.duration,
                cwd: result.resolvedCwd,
            };
        } finally {
            // Clean up
            cancellationListener?.dispose();
            if (toolCallId) {
                this.runningExecutions.delete(toolCallId);
            }
        }
    }

    protected extractToolCallId(ctx: unknown): string | undefined {
        if (ctx && typeof ctx === 'object' && 'toolCallId' in ctx) {
            return (ctx as { toolCallId?: string }).toolCallId;
        }
        return undefined;
    }

    protected extractCancellationToken(ctx: unknown): CancellationToken | undefined {
        if (ctx && typeof ctx === 'object') {
            // Check for MutableChatRequestModel structure (response.cancellationToken)
            if ('response' in ctx) {
                const response = (ctx as { response?: { cancellationToken?: CancellationToken } }).response;
                if (response?.cancellationToken) {
                    return response.cancellationToken;
                }
            }
        }
        return undefined;
    }

    protected combineAndTruncate(stdout: string, stderr: string): string {
        return combineAndTruncate(stdout, stderr);
    }
}
