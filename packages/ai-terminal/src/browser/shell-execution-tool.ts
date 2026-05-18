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
import { ToolProvider, ToolRequest, AutoActionResult } from '@theia/ai-core';
import { ShellCommandPermissionService } from './shell-command-permission-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    SHELL_EXECUTION_FUNCTION_ID,
    ShellExecutionServer,
    ShellExecutionToolResult,
    ShellExecutionCanceledResult,
    combineAndTruncate
} from '../common/shell-execution-server';
import { CancellationToken, generateUuid, Path } from '@theia/core';

@injectable()
export class ShellExecutionTool implements ToolProvider {

    @inject(ShellExecutionServer)
    protected readonly shellServer: ShellExecutionServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ShellCommandPermissionService)
    protected readonly shellCommandPermissionService: ShellCommandPermissionService;

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
                    description: {
                        type: 'string',
                        description: 'Describe what this command actually does in active voice, ' +
                            'so the user can verify the command matches their intent without ' +
                            'parsing flags or shell syntax themselves. ' +
                            'Never use words like "complex" or "risk".\n\n' +
                            'Reflect the actual mechanics of the command: significant flags, ' +
                            'filters, pipes, and output limits. When a less obvious tool or ' +
                            'flag is chosen (e.g. `find` instead of `ls`, `-type f`, `head`, ' +
                            '`sort`), state its effect rather than only the high-level goal.\n\n' +
                            'For simple commands (git, npm, standard CLI tools), keep it brief (5-10 words):\n' +
                            '- cat README.md -> "Print README file contents"\n' +
                            '- git diff HEAD~1 -> "Show changes from last commit"\n' +
                            '- npm test -> "Run project test suite"\n\n' +
                            'For longer or piped commands, add enough context to clarify intent and behavior:\n' +
                            '- grep -rn "TODO" src/ --include="*.ts" -> "Search TypeScript files in src for TODO comments"\n' +
                            '- git log --oneline --since="1 week" | wc -l -> "Count commits from the past week"\n' +
                            '- du -sh node_modules/* | sort -rh | head -5 -> "Show 5 largest packages in node_modules by size"\n' +
                            '- find . -type f | head -100 -> "Recursively list up to the first 100 files (excluding directories) under the current directory"\n\n' +
                            'Avoid descriptions that state only the intent and hide the mechanics ' +
                            '(e.g. "List all files in the workspace" for `find . -type f | head -100` ' +
                            'is too vague — it omits the recursion, file-only filter, and 100-entry limit).'
                    },
                    cwd: {
                        type: 'string',
                        description: 'Working directory for command execution. ' +
                            'Use a workspace-relative path (e.g., "backend", "frontend/src") ' +
                            'or an absolute filesystem path. ' +
                            'If omitted, defaults to the workspace root (single-root workspaces only).'
                    },
                    timeout: {
                        type: 'number',
                        description: 'Timeout in milliseconds. Default: 120000 (2 minutes). Max: 600000 (10 minutes).'
                    }
                },
                required: ['command', 'description']
            },
            handler: (argString: string, ctx?: unknown) => this.executeCommand(argString, ctx),
            checkAutoAction: (argString: string): AutoActionResult | undefined => {
                try {
                    const args = JSON.parse(argString);
                    const result = this.shellCommandPermissionService.checkCommand(args.command);

                    if (result.reason === 'denied') {
                        return {
                            action: 'deny',
                            reason: `Command denied because it matched deny pattern: ${result.matchedPattern}`
                        };
                    }
                    if (result.allowed) {
                        return { action: 'allow' };
                    }
                    return undefined; // Show confirmation UI
                } catch {
                    return undefined; // Show confirmation UI
                }
            }
        };
    }

    protected async executeCommand(argString: string, ctx?: unknown): Promise<ShellExecutionToolResult | ShellExecutionCanceledResult> {
        const args: {
            command: string;
            cwd?: string;
            timeout?: number;
        } = JSON.parse(argString);

        const resolvedCwd = this.resolveCwd(args.cwd);

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
            const result = await this.shellServer.execute({
                command: args.command,
                cwd: resolvedCwd,
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

    /**
     * Resolves a cwd value to an absolute filesystem path.
     * Handles: undefined (falls back to workspace root), absolute paths (pass-through),
     * root-relative paths (<rootName>/...), and bare root names.
     */
    private resolveCwd(cwd: string | undefined): string {
        const roots = this.workspaceService.tryGetRoots();

        if (!cwd) {
            if (roots.length === 1) {
                return roots[0].resource.path.fsPath();
            }
            const rootNames = roots.map(r => r.resource.path.base);
            throw new Error(
                'A working directory (cwd) is required in a multi-root workspace. ' +
                `Available workspace roots: ${rootNames.join(', ')}. ` +
                'Provide one as cwd (e.g., "backend") or use a sub-path (e.g., "backend/src").'
            );
        }

        const normalized = Path.normalizePathSeparator(cwd);

        if (new Path(normalized).isAbsolute) {
            return normalized;
        }

        const segments = normalized.split('/');
        for (const root of roots) {
            if (root.resource.path.base === segments[0]) {
                const rest = segments.slice(1).join('/');
                const resolved = rest ? root.resource.resolve(rest) : root.resource;
                return resolved.path.fsPath();
            }
        }

        if (roots.length === 1) {
            return roots[0].resource.resolve(normalized).path.fsPath();
        }

        return cwd;
    }

    protected extractToolCallId(ctx?: unknown): string | undefined {
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
