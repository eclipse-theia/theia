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
import { generateUuid } from '@theia/core';
import { ToolInvocationContext, ToolProvider, ToolRequest, ToolRequestParameters } from '@theia/ai-core';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    ShellExecutionResult,
    ShellExecutionServer,
    combineAndTruncate
} from '../common/shell-execution-server';

/** `providerName` reported by tools that derive from {@link PredefinedShellTool}. */
export const PREDEFINED_SHELL_TOOL_PROVIDER = 'ai-predefined-shell';

export interface PredefinedShellToolResult {
    success: boolean;
    exitCode: number | undefined;
    output: string;
    error?: string;
    duration: number;
}

export interface PredefinedShellToolCanceledResult {
    canceled: true;
    output?: string;
    duration?: number;
}

/**
 * Base class for tools that execute a fixed, hardcoded shell command. A subclass declares its
 * tool `id`, its parameters and a `buildCommand(args)` method that assembles the command from
 * typed arguments. The LLM only supplies the typed arguments, so the subclass stays in control
 * of the command.
 *
 * Unlike the general-purpose `shellExecute` tool, a {@link PredefinedShellTool} does not consult
 * `ShellCommandPermissionService` and does not appear on the user's shell allow/deny lists. The
 * safety boundary is the subclass `buildCommand`, which must not be coercible into running
 * arbitrary commands.
 */
@injectable()
export abstract class PredefinedShellTool implements ToolProvider {

    @inject(ShellExecutionServer)
    protected readonly shellServer: ShellExecutionServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /** The unique identifier of this tool. Must not be `shellExecute`. */
    abstract readonly id: string;

    /** Human-readable description of this tool, shown to the LLM. */
    abstract readonly description: string;

    protected readonly parameters: ToolRequestParameters = { type: 'object', properties: {} };

    /** Timeout for the underlying shell execution, in milliseconds. */
    protected readonly timeout: number = 30_000;

    /** Build the exact shell command to execute from the parsed arguments. */
    protected abstract buildCommand(args: Record<string, unknown>): string;

    protected formatResult(result: ShellExecutionResult): PredefinedShellToolResult {
        return {
            success: result.success,
            exitCode: result.exitCode,
            output: combineAndTruncate(result.stdout, result.stderr),
            error: result.error,
            duration: result.duration
        };
    }

    /**
     * Resolves the working directory for the shell command. The default returns the **first**
     * workspace root, which is rarely the right answer:
     *
     * - In a multi-root workspace, the first root is arbitrary; the user-selected target
     *   (e.g. SCM repository, currently focused editor) is almost always more accurate.
     * - When no workspace is open the default returns `undefined`, so the command runs in the
     *   backend process' inherited cwd.
     *
     * Subclasses **must** override this method whenever the cwd materially affects the command
     * (anything talking to a specific repository, build script, or per-folder tool). The default
     * is only safe for commands that produce the same output regardless of cwd.
     */
    protected resolveWorkspaceRoot(): string | undefined {
        return this.workspaceService.getWorkspaceRootUri(undefined)?.path.fsPath();
    }

    getTool(): ToolRequest {
        return {
            id: this.id,
            name: this.id,
            providerName: PREDEFINED_SHELL_TOOL_PROVIDER,
            description: this.description,
            parameters: this.parameters,
            handler: (argString: string, ctx?: ToolInvocationContext) => this.execute(argString, ctx)
        };
    }

    protected async execute(
        argString: string,
        ctx?: ToolInvocationContext
    ): Promise<PredefinedShellToolResult | PredefinedShellToolCanceledResult> {
        const args: Record<string, unknown> = argString ? JSON.parse(argString) : {};
        const command = this.buildCommand(args);
        const cwd = this.resolveWorkspaceRoot();

        const executionId = generateUuid();
        const cancellationListener = ctx?.cancellationToken?.onCancellationRequested(() => {
            this.shellServer.cancel(executionId);
        });

        try {
            const result = await this.shellServer.execute({
                command,
                cwd,
                timeout: this.timeout,
                executionId
            });

            if (result.canceled) {
                return {
                    canceled: true,
                    output: combineAndTruncate(result.stdout, result.stderr) || undefined,
                    duration: result.duration
                };
            }

            return this.formatResult(result);
        } finally {
            cancellationListener?.dispose();
        }
    }
}
