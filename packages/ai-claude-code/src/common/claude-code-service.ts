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

export const CLAUDE_CODE_SERVICE_PATH = '/services/claude-code';

/**
 * Message sent from backend to frontend requesting user approval for tool usage.
 */
export interface ToolApprovalRequestMessage {
    type: 'tool-approval-request';
    toolName: string;
    toolInput: unknown;
    requestId: string;
}

/**
 * Message sent from frontend to backend with user approval decision.
 */
export interface ToolApprovalResponseMessage {
    type: 'tool-approval-response';
    requestId: string;
    approved: boolean;
    message?: string; // Denial reason when approved=false
    updatedInput?: unknown; // Tool input to use when approved=true
}

export namespace ToolApprovalRequestMessage {
    export function is(obj: unknown): obj is ToolApprovalRequestMessage {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as ToolApprovalRequestMessage).type === 'tool-approval-request';
    }
}

export namespace ToolApprovalResponseMessage {
    export function is(obj: unknown): obj is ToolApprovalResponseMessage {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as ToolApprovalResponseMessage).type === 'tool-approval-response';
    }
}

export type StreamMessage = SDKMessage | ToolApprovalRequestMessage;

export interface ClaudeCodeRequest {
    prompt: string;
    options?: Partial<ClaudeCodeOptions>;
}

export interface ClaudeCodeBackendRequest extends ClaudeCodeRequest {
    apiKey?: string;
    claudeCodePath?: string;
}

export const ClaudeCodeClient = Symbol('ClaudeCodeClient');
export interface ClaudeCodeClient {
    /**
     * @param token `undefined` signals end of stream.
     */
    sendToken(streamId: string, token?: StreamMessage): void;
    sendError(streamId: string, error: Error): void;
}

export const ClaudeCodeService = Symbol('ClaudeCodeService');
export interface ClaudeCodeService {
    /**
     * Send a request to Claude Code.
     * @param request request parameters
     * @param streamId Pre-generated stream ID for tracking streaming responses
     */
    send(request: ClaudeCodeBackendRequest, streamId: string): Promise<void>;

    /**
     * Cancel a running request to Claude Code.
     * @param streamId Stream ID identifying the request
     */
    cancel(streamId: string): void;

    /**
     * Handle approval response from the frontend.
     * @param response approval response
     */
    handleApprovalResponse(response: ToolApprovalResponseMessage): void;
}

// Types that match @anthropic-ai/claude-code interfaces
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export interface NonNullableUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

export interface Usage {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

export interface SDKMessageBase {
    uuid: string;
    session_id: string;
}

export type SDKUserMessage = SDKMessageBase & {
    type: 'user';
    message: {
        role: 'user';
        content: string | ContentBlock[];
    };
    parent_tool_use_id: string | null;
};

export interface TextBlock {
    type: 'text';
    text: string;
}

export interface ToolUseContentBlock {
    type: 'tool_use' | 'server_tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
}

export interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: unknown;
    is_error?: boolean;
}

export interface ThinkingBlock {
    type: 'thinking';
    thinking: string;
    signature?: string;
}

export interface RedactedThinkingBlock {
    type: 'redacted_thinking';
    data: string;
}

export interface WebSearchToolResultBlock {
    type: 'web_search_tool_result';
    tool_use_id: string;
    content: Array<{ title: string; url: string; [key: string]: unknown }>;
}

export type ContentBlock = TextBlock | ToolUseContentBlock | ToolResultBlock | ThinkingBlock | RedactedThinkingBlock | WebSearchToolResultBlock;

export type SDKAssistantMessage = SDKMessageBase & {
    type: 'assistant';
    message: {
        id: string;
        type: 'message';
        role: 'assistant';
        content: ContentBlock[];
        model: string;
        stop_reason: string | null;
        stop_sequence: string | null;
        usage: Usage;
    };
    parent_tool_use_id: string | null;
};

export type SDKResultMessage = SDKMessageBase & {
    type: 'result';
    subtype: 'success' | 'error_max_turns' | 'error_during_execution';
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    num_turns: number;
    total_cost_usd: number;
    usage: NonNullableUsage;
    permission_denials: Array<{
        tool_name: string;
        tool_use_id: string;
        tool_input: Record<string, unknown>;
    }>;
};

export type SDKSystemMessage = SDKMessageBase & {
    type: 'system';
    subtype: 'init';
    apiKeySource: string;
    cwd: string;
    tools: string[];
    mcp_servers: Array<{
        name: string;
        status: string;
    }>;
    model: string;
    permissionMode: PermissionMode;
    slash_commands: string[];
    output_style: string;
};

export type SDKMessage = SDKAssistantMessage | SDKUserMessage | SDKResultMessage | SDKSystemMessage;

export interface ClaudeCodeOptions {
    cwd?: string;
    abortController?: AbortController;
    additionalDirectories?: string[];
    allowedTools?: string[];
    appendSystemPrompt?: string;
    canUseTool?: (toolName: string, input: Record<string, unknown>, options: {
        signal: AbortController['signal'];
    }) => Promise<{ behavior: 'allow' | 'deny'; message?: string; updatedInput?: unknown }>;
    continue?: boolean;
    customSystemPrompt?: string;
    disallowedTools?: string[];
    env?: Record<string, string>;
    executable?: 'bun' | 'deno' | 'node';
    executableArgs?: string[];
    extraArgs?: Record<string, string | null>;
    fallbackModel?: string;
    maxThinkingTokens?: number;
    maxTurns?: number;
    model?: string;
    pathToClaudeCodeExecutable?: string;
    permissionMode?: PermissionMode;
    permissionPromptToolName?: string;
    resume?: string;
    stderr?: (data: string) => void;
    strictMcpConfig?: boolean;
}

// Tool input interfaces
export interface TaskInput {
    description: string;
    prompt: string;
}

export interface EditInput {
    file_path: string;
    old_string: string;
    new_string: string;
}

export interface MultiEditInput {
    file_path: string;
    edits: Array<{ old_string: string; new_string: string }>;
}

export interface WriteInput {
    file_path: string;
    content: string;
}

export namespace TaskInput {
    export function is(input: unknown): input is TaskInput {
        // eslint-disable-next-line no-null/no-null
        return typeof input === 'object' && input !== null && 'description' in input && 'prompt' in input &&
            typeof (input as TaskInput).description === 'string' &&
            typeof (input as TaskInput).prompt === 'string';
    }
}

export namespace EditInput {
    export function is(input: unknown): input is EditInput {
        // eslint-disable-next-line no-null/no-null
        return typeof input === 'object' && input !== null &&
            'file_path' in input && 'old_string' in input && 'new_string' in input &&
            typeof (input as EditInput).file_path === 'string' &&
            typeof (input as EditInput).old_string === 'string' &&
            typeof (input as EditInput).new_string === 'string';
    }
}

export namespace MultiEditInput {
    export function is(input: unknown): input is MultiEditInput {
        // eslint-disable-next-line no-null/no-null
        return typeof input === 'object' && input !== null &&
            'file_path' in input && 'edits' in input &&
            typeof (input as MultiEditInput).file_path === 'string' &&
            Array.isArray((input as MultiEditInput).edits);
    }
}

export namespace WriteInput {
    export function is(input: unknown): input is WriteInput {
        // eslint-disable-next-line no-null/no-null
        return typeof input === 'object' && input !== null &&
            'file_path' in input && 'content' in input &&
            typeof (input as WriteInput).file_path === 'string' &&
            typeof (input as WriteInput).content === 'string';
    }
}
