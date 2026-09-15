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
    /** Working directory. Resolved to an absolute path on the frontend before sending to the backend. */
    cwd?: string;
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

/**
 * Line and line-length budget applied to combined command output. The defaults suit the
 * general-purpose `shellExecute` tool, where output is often a long build or test log and only
 * the beginning and the end carry information. Tools whose output is meaningful as a whole
 * (e.g. a diff) should raise these limits.
 */
export interface OutputTruncationOptions {
    /** Number of leading lines to keep. Default {@link HEAD_LINES}. */
    headLines?: number;
    /** Number of trailing lines to keep. Default {@link TAIL_LINES}. */
    tailLines?: number;
    /** Extra lines tolerated before truncation kicks in at all. Default {@link GRACE_LINES}. */
    graceLines?: number;
    /** Maximum length of a single line before its middle is elided. Default {@link MAX_LINE_LENGTH}. */
    maxLineLength?: number;
}

export function truncateLine(line: string, maxLineLength: number = MAX_LINE_LENGTH): string {
    if (line.length <= maxLineLength) {
        return line;
    }
    const halfLength = Math.floor((maxLineLength - 30) / 2);
    const omittedCount = line.length - halfLength * 2;
    return `${line.slice(0, halfLength)} ... [${omittedCount} chars omitted] ... ${line.slice(-halfLength)}`;
}

export function combineAndTruncate(stdout: string, stderr: string, options?: OutputTruncationOptions): string {
    const head = options?.headLines ?? HEAD_LINES;
    const tail = options?.tailLines ?? TAIL_LINES;
    const grace = options?.graceLines ?? GRACE_LINES;
    const maxLineLength = options?.maxLineLength ?? MAX_LINE_LENGTH;

    const trimmedStdout = stdout.trim();
    const trimmedStderr = stderr.trim();

    let output = trimmedStdout;
    if (trimmedStderr) {
        output = output
            ? `${output}\n--- stderr ---\n${trimmedStderr}`
            : trimmedStderr;
    }

    if (!output) {
        return output;
    }

    const lines = output.split('\n');

    if (lines.length <= head + tail + grace) {
        return lines.map(line => truncateLine(line, maxLineLength)).join('\n');
    }

    const headLines = lines.slice(0, head).map(line => truncateLine(line, maxLineLength));
    const tailLines = lines.slice(-tail).map(line => truncateLine(line, maxLineLength));
    const omittedCount = lines.length - head - tail;

    return [...headLines, `\n... [${omittedCount} lines omitted] ...\n`, ...tailLines].join('\n');
}
