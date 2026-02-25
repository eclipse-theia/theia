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

export const SHELL_EXECUTION_FUNCTION_ID = 'shellExecute';

export const ShellExecutionServer = Symbol('ShellExecutionServer');
export const shellExecutionPath = '/services/shell-execution';

export interface ShellExecutionRequest {
    command: string;
    /** Working directory. Can be absolute or relative to workspaceRoot. */
    cwd?: string;
    /** Workspace root path for resolving relative cwd paths */
    workspaceRoot?: string;
    timeout?: number; // milliseconds
    /** Unique ID for this execution, used for cancellation */
    executionId?: string;
}

export interface ShellExecutionResult {
    success: boolean;
    exitCode: number | undefined;
    stdout: string;
    stderr: string;
    error?: string;
    /** Execution duration in milliseconds */
    duration: number;
    /** Whether the execution was canceled by user action (not timeout) */
    canceled?: boolean;
    /** The resolved working directory where the command was executed */
    resolvedCwd?: string;
    /** Whether stdout was capped at the stream-level size limit */
    stdoutCapped?: boolean;
    /** Whether stderr was capped at the stream-level size limit */
    stderrCapped?: boolean;
}

export interface ShellExecutionServer {
    execute(request: ShellExecutionRequest): Promise<ShellExecutionResult>;
    cancel(executionId: string): Promise<boolean>;
}

export interface ShellExecutionToolResult {
    success: boolean;
    exitCode: number | undefined;
    output: string;
    error?: string;
    duration: number;
    cwd?: string;
}

export interface ShellExecutionCanceledResult {
    canceled: true;
    output?: string;
    duration?: number;
}

export namespace ShellExecutionToolResult {
    export function is(obj: unknown): obj is ShellExecutionToolResult {
        return !!obj && typeof obj === 'object' &&
            'success' in obj && typeof (obj as ShellExecutionToolResult).success === 'boolean' &&
            'duration' in obj && typeof (obj as ShellExecutionToolResult).duration === 'number';
    }
}

export namespace ShellExecutionCanceledResult {
    export function is(obj: unknown): obj is ShellExecutionCanceledResult {
        return !!obj && typeof obj === 'object' &&
            'canceled' in obj && (obj as ShellExecutionCanceledResult).canceled === true;
    }
}

export const HEAD_LINES = 50;
export const TAIL_LINES = 50;
export const GRACE_LINES = 10;
export const MAX_LINE_LENGTH = 1000;

export function truncateLine(line: string): string {
    return truncateLineWithInfo(line).result;
}

export interface TruncateLineResult {
    result: string;
    charsOmitted: number;
}

export function truncateLineWithInfo(line: string): TruncateLineResult {
    if (line.length <= MAX_LINE_LENGTH) {
        return { result: line, charsOmitted: 0 };
    }
    const halfLength = Math.floor((MAX_LINE_LENGTH - 30) / 2);
    const omittedCount = line.length - halfLength * 2;
    return {
        result: `${line.slice(0, halfLength)} ... [${omittedCount} chars omitted] ... ${line.slice(-halfLength)}`,
        charsOmitted: omittedCount
    };
}

/**
 * Combines stdout and stderr into a single string without any truncation.
 */
export function combineOutput(stdout: string, stderr: string): string {
    const trimmedStdout = stdout.trim();
    const trimmedStderr = stderr.trim();
    if (trimmedStdout && trimmedStderr) {
        return `${trimmedStdout}\n--- stderr ---\n${trimmedStderr}`;
    }
    return trimmedStdout || trimmedStderr;
}

export interface TruncateOutputResult {
    output: string;
    totalCharsOmitted: number;
}

/**
 * Applies line-count and line-length truncation to an already-combined output string.
 */
export function truncateOutput(output: string): TruncateOutputResult {
    if (!output) {
        return { output, totalCharsOmitted: 0 };
    }

    const lines = output.split('\n');
    let totalCharsOmitted = 0;

    if (lines.length <= HEAD_LINES + TAIL_LINES + GRACE_LINES) {
        const truncatedLines = lines.map(line => {
            const { result, charsOmitted } = truncateLineWithInfo(line);
            totalCharsOmitted += charsOmitted;
            return result;
        });
        return { output: truncatedLines.join('\n'), totalCharsOmitted };
    }

    const omittedLineCount = lines.length - HEAD_LINES - TAIL_LINES;
    const omittedLines = lines.slice(HEAD_LINES, lines.length - TAIL_LINES);
    for (const line of omittedLines) {
        totalCharsOmitted += line.length + 1; // +1 for the newline
    }
    // Adjust: the last omitted line doesn't have a trailing newline in the join
    totalCharsOmitted -= 1;

    const headLines = lines.slice(0, HEAD_LINES).map(line => {
        const { result, charsOmitted } = truncateLineWithInfo(line);
        totalCharsOmitted += charsOmitted;
        return result;
    });
    const tailLines = lines.slice(-TAIL_LINES).map(line => {
        const { result, charsOmitted } = truncateLineWithInfo(line);
        totalCharsOmitted += charsOmitted;
        return result;
    });

    return {
        output: [...headLines, `\n... [${omittedLineCount} lines omitted] ...\n`, ...tailLines].join('\n'),
        totalCharsOmitted
    };
}
