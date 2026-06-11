// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * QAIQ SDK stdio permission protocol (`--permission-prompt-tool stdio` +
 * `--input-format stream-json`).
 *
 * In this mode QAIQ pauses on every `ask` permission decision and emits a
 * `control_request` NDJSON line on stdout instead of auto-denying. The host
 * (our task runner) answers with a `control_response` line on stdin, which
 * resumes or rejects the tool call. This is what makes the "request approval"
 * composer preset actually pause-and-wait instead of insta-failing the tool.
 */

/** Flags that switch a headless QAIQ run to the pause-and-wait permission flow. */
export const QAIQ_STDIO_APPROVAL_FLAGS = '--input-format stream-json --permission-prompt-tool stdio';

export interface QaapQaiqPendingControlRequest {
    readonly requestId: string;
    readonly toolUseId?: string;
    readonly toolName?: string;
    readonly toolInput?: Record<string, unknown>;
}

export type QaapQaiqStdioEvent =
    | { readonly type: 'control-request'; readonly request: QaapQaiqPendingControlRequest }
    | { readonly type: 'control-cancel'; readonly requestId: string }
    /** End-of-turn `result` message — the host should close stdin so the CLI exits. */
    | { readonly type: 'result' };

/**
 * Parse one stdout NDJSON line from a QAIQ stdio-approval run. Returns
 * `undefined` for everything that is not relevant to the approval flow
 * (assistant deltas, system messages, non-JSON noise).
 */
export function parseQaiqStdioEvent(line: string): QaapQaiqStdioEvent | undefined {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
        return undefined;
    }
    let message: Record<string, unknown>;
    try {
        message = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        return undefined;
    }
    if (message.type === 'result') {
        return { type: 'result' };
    }
    if (message.type === 'control_cancel_request' && typeof message.request_id === 'string') {
        return { type: 'control-cancel', requestId: message.request_id };
    }
    if (message.type !== 'control_request' || typeof message.request_id !== 'string') {
        return undefined;
    }
    const request = message.request as Record<string, unknown> | undefined;
    if (!request || request.subtype !== 'can_use_tool') {
        return undefined;
    }
    return {
        type: 'control-request',
        request: {
            requestId: message.request_id,
            toolUseId: typeof request.tool_use_id === 'string' ? request.tool_use_id : undefined,
            toolName: typeof request.tool_name === 'string' ? request.tool_name : undefined,
            toolInput: request.input && typeof request.input === 'object'
                ? request.input as Record<string, unknown>
                : undefined,
        },
    };
}

/** NDJSON line carrying the user prompt for an `--input-format stream-json` run. */
export function buildQaiqStdioPromptLine(prompt: string): string {
    return JSON.stringify({
        type: 'user',
        session_id: '',
        message: { role: 'user', content: prompt },
        // Wire field of the QAIQ SDK protocol — must be present and null.
        // eslint-disable-next-line no-null/no-null
        parent_tool_use_id: null,
    }) + '\n';
}

/**
 * NDJSON `control_response` line answering a pending `can_use_tool` request.
 * An empty `updatedInput` tells QAIQ to run the tool with its original input.
 */
export function buildQaiqControlResponseLine(
    pending: QaapQaiqPendingControlRequest,
    action: 'approve' | 'reject',
    options: { readonly denyMessage?: string } = {},
): string {
    const response = action === 'approve'
        ? {
            behavior: 'allow',
            updatedInput: {},
            ...(pending.toolUseId ? { toolUseID: pending.toolUseId } : {}),
        }
        : {
            behavior: 'deny',
            message: options.denyMessage
                ?? ('The user declined this action from the Qaap approvals UI. '
                    + 'Do not retry it unchanged; continue with an allowed alternative or explain what you need.'),
            ...(pending.toolUseId ? { toolUseID: pending.toolUseId } : {}),
        };
    return JSON.stringify({
        type: 'control_response',
        response: {
            subtype: 'success',
            request_id: pending.requestId,
            response,
        },
    }) + '\n';
}
