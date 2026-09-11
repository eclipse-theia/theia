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

import { injectable } from '@theia/core/shared/inversify';
import { ToolInvocationContext, ToolRequest, ToolRequestParameters } from '@theia/ai-core';
import { AbstractShellExecutionTool } from './abstract-shell-execution-tool';
import { OutputTruncationOptions, ShellExecutionCanceledResult, ShellExecutionToolResult } from '../common/shell-execution-server';

/** `providerName` reported by tools that derive from {@link PredefinedShellTool}. */
export const PREDEFINED_SHELL_TOOL_PROVIDER = 'ai-predefined-shell';

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
export abstract class PredefinedShellTool extends AbstractShellExecutionTool {

    /** The unique identifier of this tool. Must not be `shellExecute`. */
    abstract readonly id: string;

    /** Human-readable description of this tool, shown to the LLM. */
    abstract readonly description: string;

    protected readonly parameters: ToolRequestParameters = { type: 'object', properties: {} };

    /** Timeout for the underlying shell execution, in milliseconds. */
    protected readonly timeout: number = 30_000;

    /** Output truncation budget. `undefined` keeps the `shellExecute` defaults (first/last 50 lines). */
    protected readonly truncation: OutputTruncationOptions | undefined = undefined;

    /** Build the exact shell command to execute from the parsed arguments. */
    protected abstract buildCommand(args: Record<string, unknown>): string;

    /**
     * Resolves the working directory for the shell command. Deliberately abstract: the cwd
     * materially affects most predefined commands (anything talking to a specific repository,
     * build script, or per-folder tool), and silently defaulting to an arbitrary workspace root
     * produces results that look plausible but describe the wrong folder.
     *
     * Subclasses that genuinely do not care about the cwd can return
     * {@link firstWorkspaceRoot} or `undefined`.
     */
    protected abstract resolveWorkspaceRoot(): string | undefined;

    /**
     * The **first** workspace root, or `undefined` when no workspace is open. Only a sensible
     * `resolveWorkspaceRoot` implementation for commands that produce the same output regardless
     * of cwd — in a multi-root workspace the first root is arbitrary.
     */
    protected firstWorkspaceRoot(): string | undefined {
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

    protected async execute(argString: string, ctx?: ToolInvocationContext): Promise<ShellExecutionToolResult | ShellExecutionCanceledResult> {
        const args: Record<string, unknown> = argString ? JSON.parse(argString) : {};
        return this.runShellCommand({
            command: this.buildCommand(args),
            cwd: this.resolveWorkspaceRoot(),
            timeout: this.timeout,
            toolCallId: ctx?.toolCallId,
            cancellationToken: ctx?.cancellationToken,
            truncation: this.truncation
        });
    }
}
