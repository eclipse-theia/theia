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

import {
    ChatAgent,
    ChatAgentLocation,
    ErrorChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    ThinkingChatResponseContentImpl,
    ToolCallChatResponseContent,
} from '@theia/ai-chat';
import { TokenUsageService } from '@theia/ai-core';
import { PromptText } from '@theia/ai-core/lib/common/prompt-text';
import { generateUuid, nls } from '@theia/core';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import type {
    ItemStartedEvent,
    ItemUpdatedEvent,
    ItemCompletedEvent,
    TurnCompletedEvent,
    TurnFailedEvent,
    ThreadEvent,
    ThreadItem,
    CommandExecutionItem,
    FileChangeItem,
    McpToolCallItem,
    WebSearchItem,
    Usage,
    TodoListItem
} from '@openai/codex-sdk';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { CodexToolCallChatResponseContent } from './codex-tool-call-content';
import { CodexFrontendService } from './codex-frontend-service';

export const CODEX_CHAT_AGENT_ID = 'Codex';
export const CODEX_INPUT_TOKENS_KEY = 'codexInputTokens';
export const CODEX_OUTPUT_TOKENS_KEY = 'codexOutputTokens';
export const CODEX_TOOL_CALLS_KEY = 'codexToolCalls';

const CODEX_FILE_CHANGE_ORIGINALS_KEY = 'codexFileChangeOriginals';
// const CODEX_CHANGESET_TITLE = nls.localize('theia/ai/codex/changeSetTitle', 'Codex Applied Changes');

type ToolInvocationItem = CommandExecutionItem | FileChangeItem | McpToolCallItem | WebSearchItem | TodoListItem;

/**
 * Chat agent for OpenAI Codex integration.
 */
@injectable()
export class CodexChatAgent implements ChatAgent {
    id = CODEX_CHAT_AGENT_ID;
    name = 'Codex';
    description = nls.localize('theia/ai/codex/agentDescription',
        'OpenAI\'s coding assistant powered by Codex');
    iconClass = 'codicon codicon-robot';
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;
    tags = [nls.localizeByDefault('Chat')];
    variables: string[] = [];
    prompts: [] = [];
    languageModelRequirements: [] = [];
    agentSpecificVariables: [] = [];
    functions: string[] = [];
    modes = [
        { id: 'workspace-write', name: 'Workspace' },
        { id: 'read-only', name: 'Read-Only' },
        { id: 'danger-full-access', name: 'Full Access' }
    ];

    @inject(CodexFrontendService)
    protected codexService: CodexFrontendService;

    @inject(TokenUsageService)
    protected tokenUsageService: TokenUsageService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    async invoke(request: MutableChatRequestModel): Promise<void> {
        try {
            const agentAddress = `${PromptText.AGENT_CHAR}${CODEX_CHAT_AGENT_ID}`;
            let prompt = request.request.text.trim();
            if (prompt.startsWith(agentAddress)) {
                prompt = prompt.replace(agentAddress, '').trim();
            }

            // Check if prompt is empty after removing agent address
            if (prompt.length === 0) {
                request.response.response.addContent(
                    new MarkdownChatResponseContentImpl(nls.localize('theia/ai/chat/emptyRequest', 'Please provide a message or question.'))
                );
                request.response.complete();
                return;
            }

            const sessionId = request.session.id;
            const sandboxMode = this.extractSandboxMode(request.request.modeId);
            const streamResult = await this.codexService.send(
                { prompt, sessionId, sandboxMode },
                request.response.cancellationToken
            );

            for await (const event of streamResult) {
                await this.handleEvent(event, request);
            }

            request.response.complete();
        } catch (error) {
            console.error('Codex error:', error);
            request.response.response.addContent(
                new ErrorChatResponseContentImpl(error)
            );
            request.response.error(error);
        }
    }

    protected extractSandboxMode(modeId?: string): 'read-only' | 'workspace-write' | 'danger-full-access' {
        if (modeId === 'read-only' || modeId === 'workspace-write' || modeId === 'danger-full-access') {
            return modeId;
        }
        return 'workspace-write';
    }

    protected getToolCalls(request: MutableChatRequestModel): Map<string, CodexToolCallChatResponseContent> {
        let toolCalls = request.getDataByKey(CODEX_TOOL_CALLS_KEY) as Map<string, CodexToolCallChatResponseContent> | undefined;
        if (!toolCalls) {
            toolCalls = new Map();
            request.addData(CODEX_TOOL_CALLS_KEY, toolCalls);
        }
        return toolCalls;
    }

    protected async handleEvent(event: ThreadEvent, request: MutableChatRequestModel): Promise<void> {
        if (event.type === 'item.started') {
            await this.handleItemStarted(event, request);
        } else if (event.type === 'item.updated') {
            await this.handleItemUpdated(event, request);
        } else if (event.type === 'item.completed') {
            await this.handleItemCompleted(event, request);
        } else if (event.type === 'turn.completed') {
            this.handleTurnCompleted(event, request);
        } else if (event.type === 'turn.failed') {
            this.handleTurnFailed(event, request);
        }
    }

    /**
     * Type guard using discriminated union narrowing from SDK types.
     */
    protected isToolInvocation(item: ThreadItem): item is ToolInvocationItem {
        return item.type === 'command_execution' ||
            item.type === 'todo_list' ||
            item.type === 'file_change' ||
            item.type === 'mcp_tool_call' ||
            item.type === 'web_search';
    }

    protected extractToolArguments(item: ToolInvocationItem): string {
        const args: Record<string, unknown> = {};

        if (item.type === 'command_execution') {
            args.command = item.command;
            args.status = item.status;
            if (item.exit_code !== undefined) {
                args.exit_code = item.exit_code;
            }
        } else if (item.type === 'file_change') {
            args.changes = item.changes;
            args.status = item.status;
        } else if (item.type === 'mcp_tool_call') {
            args.server = item.server;
            args.tool = item.tool;
            args.status = item.status;
        } else if (item.type === 'web_search') {
            args.query = item.query;
        } else if (item.type === 'todo_list') {
            args.id = item.id;
            args.items = item.items;
        }

        return JSON.stringify(args);
    }

    /**
     * Creates a pending tool call that will be updated when the item completes.
     */
    protected async handleItemStarted(event: ItemStartedEvent, request: MutableChatRequestModel): Promise<void> {
        const item = event.item;

        if (this.isToolInvocation(item)) {
            if (item.type === 'file_change') {
                await this.captureFileChangeOriginals(item, request);
                return;
            }
            const toolCallId = generateUuid();
            const args = this.extractToolArguments(item);

            const toolCall = new CodexToolCallChatResponseContent(
                toolCallId,
                item.type,
                args,
                false,
                undefined
            );

            this.getToolCalls(request).set(toolCallId, toolCall);
            request.response.response.addContent(toolCall);
        }
    }

    /**
     * Updates the pending tool call with new data, especially for todo_list items.
     */
    protected async handleItemUpdated(event: ItemUpdatedEvent, request: MutableChatRequestModel): Promise<void> {
        const item = event.item;

        if (this.isToolInvocation(item)) {
            const toolCalls = this.getToolCalls(request);
            const match = this.findMatchingToolCall(item, toolCalls);

            if (match) {
                const [_, existingCall] = match;
                existingCall.update(this.extractToolArguments(item));
                request.response.response.responseContentChanged();
            }
        }
    }

    protected findMatchingToolCall(
        item: ToolInvocationItem,
        toolCalls: Map<string, CodexToolCallChatResponseContent>
    ): [string, CodexToolCallChatResponseContent] | undefined {
        let matchKey: string | undefined;
        if (item.type === 'command_execution') {
            matchKey = item.command;
        } else if (item.type === 'web_search') {
            matchKey = item.query;
        } else if (item.type === 'mcp_tool_call') {
            matchKey = `${item.server}:${item.tool}`;
        } else if (item.type === 'todo_list') {
            matchKey = item.id;
        }

        if (!matchKey) {
            return undefined;
        }

        for (const [id, call] of toolCalls.entries()) {
            const toolCallContent = call as ToolCallChatResponseContent;
            if (toolCallContent.name !== item.type || toolCallContent.finished) {
                continue;
            }

            try {
                const args = toolCallContent.arguments ? JSON.parse(toolCallContent.arguments) : {};
                let argKey: string | undefined;

                if (item.type === 'command_execution') {
                    argKey = args.command;
                } else if (item.type === 'web_search') {
                    argKey = args.query;
                } else if (item.type === 'mcp_tool_call') {
                    argKey = `${args.server}:${args.tool}`;
                } else if (item.type === 'todo_list') {
                    argKey = args.id;
                }

                if (argKey === matchKey) {
                    return [id, call];
                }
            } catch {
                continue;
            }
        }

        return undefined;
    }

    protected getFileChangeOriginals(request: MutableChatRequestModel): Map<string, Map<string, string>> {
        let originals = request.getDataByKey(CODEX_FILE_CHANGE_ORIGINALS_KEY) as Map<string, Map<string, string>> | undefined;
        if (!originals) {
            originals = new Map();
            request.addData(CODEX_FILE_CHANGE_ORIGINALS_KEY, originals);
        }
        return originals;
    }

    /**
     * Snapshot the original contents for files that Codex is about to modify so we can populate the change set later.
     */
    protected async captureFileChangeOriginals(item: FileChangeItem, request: MutableChatRequestModel): Promise<void> {
        const changes = item.changes;
        if (!changes || changes.length === 0) {
            return;
        }

        const rootUri = await this.getWorkspaceRootUri();
        if (!rootUri) {
            return;
        }

        const originals = this.getFileChangeOriginals(request);
        let itemOriginals = originals.get(item.id);
        if (!itemOriginals) {
            itemOriginals = new Map();
            originals.set(item.id, itemOriginals);
        }

        for (const change of changes) {
            const rawPath = typeof change.path === 'string' ? change.path.trim() : '';
            const path = this.normalizeRelativePath(rawPath, rootUri);
            if (!path) {
                continue;
            }

            const fileUri = this.resolveFileUri(rootUri, path);
            if (!fileUri) {
                continue;
            }

            // For additions we snapshot an empty original state; for deletions/updates we capture existing content if available.
            if (change.kind === 'add') {
                itemOriginals.set(path, '');
                continue;
            }

            try {
                if (await this.fileService.exists(fileUri)) {
                    const currentContent = await this.fileService.read(fileUri);
                    itemOriginals.set(path, currentContent.value.toString());
                } else {
                    itemOriginals.set(path, '');
                }
            } catch (error) {
                console.error('CodexChatAgent: Failed to capture original content for', path, error);
                itemOriginals.set(path, '');
            }
        }
    }

    protected async handleFileChangeCompleted(item: FileChangeItem, request: MutableChatRequestModel): Promise<boolean> {
        if (!item.changes || item.changes.length === 0) {
            return false;
        }

        const originals = this.getFileChangeOriginals(request);

        if (item.status === 'failed') {
            const affectedPaths = item.changes
                .map(change => change.path)
                .filter(path => !!path)
                .join(', ');
            const message = affectedPaths.length > 0
                ? nls.localize('theia/ai/codex/fileChangeFailed', 'Codex failed to apply changes for: {0}', affectedPaths)
                : nls.localize('theia/ai/codex/fileChangeFailedGeneric', 'Codex failed to apply file changes.');
            request.response.response.addContent(
                new ErrorChatResponseContentImpl(new Error(message))
            );
            originals.delete(item.id);
            return true;
        }

        // const rootUri = await this.getWorkspaceRootUri();
        // if (!rootUri) {
        //     console.warn('CodexChatAgent: Unable to resolve workspace root for file change event.');
        //     return false;
        // }

        // const changeSet = request.session?.changeSet;
        // if (!changeSet) {
        //     originals.delete(item.id);
        //     return false;
        // }

        // const itemOriginals = originals.get(item.id);
        // let createdElement = false;

        // for (const change of item.changes) {
        //     const rawPath = typeof change.path === 'string' ? change.path.trim() : '';
        //     const path = this.normalizeRelativePath(rawPath, rootUri);
        //     if (!path) {
        //         continue;
        //     }

        //     const fileUri = this.resolveFileUri(rootUri, path);
        //     if (!fileUri) {
        //         continue;
        //     }

        //     const originalState = itemOriginals?.get(path) ?? '';
        //     let targetState = '';

        //     if (change.kind !== 'delete') {
        //         const content = await this.readFileContentSafe(fileUri);
        //         if (content === undefined) {
        //             continue;
        //         }
        //         targetState = content;
        //     }

        //     const elementType = this.mapChangeKind(change.kind);
        //     const fileElement = this.fileChangeFactory({
        //         uri: fileUri,
        //         type: elementType,
        //         state: 'applied',
        //         targetState,
        //         originalState,
        //         requestId: request.id,
        //         chatSessionId: request.session.id
        //     });

        //     changeSet.addElements(fileElement);
        //     createdElement = true;
        // }

        originals.delete(item.id);

        // if (createdElement) {
        //     changeSet.setTitle(CODEX_CHANGESET_TITLE);
        // }
        return false;
    }

    protected normalizeRelativePath(path: string, rootUri?: URI): string | undefined {
        if (!path) {
            return undefined;
        }

        let normalized = path.replace(/\\/g, '/').trim();
        if (!normalized) {
            return undefined;
        }

        if (normalized.includes('://')) {
            try {
                const uri = new URI(normalized);
                normalized = uri.path.fsPath();
            } catch {
            }
        }

        if (/^[a-zA-Z]:\//.test(normalized)) {
            normalized = `/${normalized}`;
        }

        if (rootUri) {
            const candidates = [
                this.ensureTrailingSlash(rootUri.path.normalize().toString()),
                this.ensureTrailingSlash(rootUri.path.fsPath().replace(/\\/g, '/'))
            ];

            const lowerNormalized = normalized.toLowerCase();
            for (const candidate of candidates) {
                if (!candidate) {
                    continue;
                }
                const lowerCandidate = candidate.toLowerCase();
                if (lowerNormalized.startsWith(lowerCandidate)) {
                    normalized = normalized.substring(candidate.length);
                    break;
                }
            }
        }

        if (normalized.startsWith('./')) {
            normalized = normalized.substring(2);
        }
        while (normalized.startsWith('/')) {
            normalized = normalized.substring(1);
        }

        normalized = normalized.trim();
        return normalized || undefined;
    }

    protected ensureTrailingSlash(path: string): string {
        if (!path) {
            return '';
        }
        return path.endsWith('/') ? path : `${path}/`;
    }

    // protected async readFileContentSafe(fileUri: URI): Promise<string | undefined> {
    //     try {
    //         if (!await this.fileService.exists(fileUri)) {
    //             console.warn('CodexChatAgent: Skipping file change entry because file is missing', fileUri.toString());
    //             return undefined;
    //         }
    //         const fileContent = await this.fileService.read(fileUri);
    //         return fileContent.value.toString();
    //     } catch (error) {
    //         console.error('CodexChatAgent: Failed to read updated file content for', fileUri.toString(), error);
    //         return undefined;
    //     }
    // }

    // protected mapChangeKind(kind: FileChangeItem['changes'][number]['kind']): 'add' | 'delete' | 'modify' {
    //     switch (kind) {
    //         case 'add':
    //             return 'add';
    //         case 'delete':
    //             return 'delete';
    //         default:
    //             return 'modify';
    //     }
    // }

    protected resolveFileUri(rootUri: URI, relativePath: string): URI | undefined {
        try {
            const candidate = rootUri.resolve(relativePath);
            const normalizedCandidate = candidate.withPath(candidate.path.normalize());
            const normalizedRoot = rootUri.withPath(rootUri.path.normalize());
            if (!normalizedRoot.isEqualOrParent(normalizedCandidate)) {
                console.warn(`CodexChatAgent: Skipping file change outside workspace: ${relativePath}`);
                return undefined;
            }
            return normalizedCandidate;
        } catch (error) {
            console.error('CodexChatAgent: Failed to resolve file URI for', relativePath, error);
            return undefined;
        }
    }

    protected async getWorkspaceRootUri(): Promise<URI | undefined> {
        const roots = await this.workspaceService.roots;
        if (roots && roots.length > 0) {
            return roots[0].resource;
        }
        return undefined;
    }

    protected async handleItemCompleted(event: ItemCompletedEvent, request: MutableChatRequestModel): Promise<void> {
        const item = event.item;

        if (this.isToolInvocation(item)) {
            if (item.type === 'file_change') {
                const handled = await this.handleFileChangeCompleted(item, request);
                if (handled) {
                    return;
                }
            }
            const toolCalls = this.getToolCalls(request);
            const match = this.findMatchingToolCall(item, toolCalls);

            if (match) {
                const [id, _] = match;
                const updatedCall = new CodexToolCallChatResponseContent(
                    id,
                    item.type,
                    this.extractToolArguments(item),
                    true,
                    JSON.stringify(item)
                );
                toolCalls.set(id, updatedCall);
                request.response.response.addContent(updatedCall);
            } else {
                const toolCallId = generateUuid();
                const newToolCall = new CodexToolCallChatResponseContent(
                    toolCallId,
                    item.type,
                    this.extractToolArguments(item),
                    true,
                    JSON.stringify(item)
                );
                toolCalls.set(toolCallId, newToolCall);
                request.response.response.addContent(newToolCall);
            }
        } else if (item.type === 'reasoning') {
            request.response.response.addContent(
                new ThinkingChatResponseContentImpl(item.text, '')
            );

        } else if (item.type === 'agent_message') {
            request.response.response.addContent(
                new MarkdownChatResponseContentImpl(item.text)
            );
        } else if (item.type === 'error') {
            request.response.response.addContent(
                new ErrorChatResponseContentImpl(new Error(item.message))
            );
        }
    }

    protected handleTurnCompleted(event: TurnCompletedEvent, request: MutableChatRequestModel): void {
        const usage = event.usage;
        this.updateTokens(request, usage.input_tokens, usage.output_tokens);
        this.reportTokenUsage(request, usage);
    }

    protected handleTurnFailed(event: TurnFailedEvent, request: MutableChatRequestModel): void {
        const errorMsg = event.error.message;
        request.response.response.addContent(
            new ErrorChatResponseContentImpl(new Error(errorMsg))
        );
    }

    protected updateTokens(request: MutableChatRequestModel, inputTokens: number, outputTokens: number): void {
        request.addData(CODEX_INPUT_TOKENS_KEY, inputTokens);
        request.addData(CODEX_OUTPUT_TOKENS_KEY, outputTokens);
        this.updateSessionSuggestion(request);
    }

    protected updateSessionSuggestion(request: MutableChatRequestModel): void {
        const { inputTokens, outputTokens } = this.getSessionTotalTokens(request);
        const formatTokens = (tokens: number): string => {
            if (tokens >= 1000) {
                return `${(tokens / 1000).toFixed(1)}K`;
            }
            return tokens.toString();
        };
        const suggestion = `↑ ${formatTokens(inputTokens)} | ↓ ${formatTokens(outputTokens)}`;
        request.session.setSuggestions([suggestion]);
    }

    protected getSessionTotalTokens(request: MutableChatRequestModel): { inputTokens: number; outputTokens: number } {
        const requests = request.session.getRequests();
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        for (const req of requests) {
            const inputTokens = req.getDataByKey(CODEX_INPUT_TOKENS_KEY) as number ?? 0;
            const outputTokens = req.getDataByKey(CODEX_OUTPUT_TOKENS_KEY) as number ?? 0;
            totalInputTokens += inputTokens;
            totalOutputTokens += outputTokens;
        }

        return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
    }

    protected async reportTokenUsage(request: MutableChatRequestModel, usage: Usage): Promise<void> {
        try {
            await this.tokenUsageService.recordTokenUsage('openai/codex', {
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                cachedInputTokens: usage.cached_input_tokens,
                requestId: request.id
            });
        } catch (error) {
            console.error('Failed to report token usage:', error);
        }
    }
}
