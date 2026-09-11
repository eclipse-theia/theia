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
import { CancellationToken, generateUuid } from '@theia/core';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    OutputTruncationOptions,
    ShellExecutionCanceledResult,
    ShellExecutionServer,
    ShellExecutionToolResult,
    combineAndTruncate
} from '../common/shell-execution-server';

/** A single shell command to run through {@link AbstractShellExecutionTool.runShellCommand}. */
export interface ShellCommandExecution {
    command: string;
    /** Absolute working directory. If omitted the command runs in the backend process' cwd. */
    cwd?: string;
    /** Timeout in milliseconds. Falls back to the backend default when omitted. */
    timeout?: number;
    /** Tool call id, used to make the execution cancellable via {@link AbstractShellExecutionTool.cancelExecution}. */
    toolCallId?: string;
    /** Cancels the underlying process when fired. */
    cancellationToken?: CancellationToken;
    /** Overrides the default output truncation budget. */
    truncation?: OutputTruncationOptions;
}

/**
 * Shared plumbing for tools that run a shell command through the {@link ShellExecutionServer}:
 * execution-id bookkeeping, cancellation wiring, the canceled-result branch and output truncation.
 *
 * Subclasses only decide *which* command runs and how it is exposed to the LLM.
 */
@injectable()
export abstract class AbstractShellExecutionTool implements ToolProvider {

    @inject(ShellExecutionServer)
    protected readonly shellServer: ShellExecutionServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /** Maps tool call ids to the execution ids of their in-flight shell commands. */
    protected readonly runningExecutions = new Map<string, string>();

    abstract getTool(): ToolRequest;

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

    /** Runs `execution` and maps the raw server result onto the tool result shape. */
    protected async runShellCommand(execution: ShellCommandExecution): Promise<ShellExecutionToolResult | ShellExecutionCanceledResult> {
        const { command, cwd, timeout, toolCallId, cancellationToken, truncation } = execution;

        const executionId = generateUuid();
        if (toolCallId) {
            this.runningExecutions.set(toolCallId, executionId);
        }
        const cancellationListener = cancellationToken?.onCancellationRequested(() => {
            this.shellServer.cancel(executionId);
        });

        try {
            const result = await this.shellServer.execute({ command, cwd, timeout, executionId });

            if (result.canceled) {
                return {
                    canceled: true,
                    output: this.combineAndTruncate(result.stdout, result.stderr, truncation) || undefined,
                    duration: result.duration
                };
            }

            return {
                success: result.success,
                exitCode: result.exitCode,
                output: this.combineAndTruncate(result.stdout, result.stderr, truncation),
                error: result.error,
                duration: result.duration,
                cwd: result.resolvedCwd
            };
        } finally {
            cancellationListener?.dispose();
            if (toolCallId) {
                this.runningExecutions.delete(toolCallId);
            }
        }
    }

    protected combineAndTruncate(stdout: string, stderr: string, options?: OutputTruncationOptions): string {
        return combineAndTruncate(stdout, stderr, options);
    }
}
