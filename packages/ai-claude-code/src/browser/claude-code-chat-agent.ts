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
    ChatAgentService,
    ErrorChatResponseContentImpl,
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    QuestionResponseContentImpl,
    ThinkingChatResponseContentImpl,
} from '@theia/ai-chat';
import { AI_CHAT_NEW_CHAT_WINDOW_COMMAND, AI_CHAT_SHOW_CHATS_COMMAND } from '@theia/ai-chat-ui/lib/browser/chat-view-commands';
import { PromptText } from '@theia/ai-core/lib/common/prompt-text';
import { AIVariableResolutionRequest, BasePromptFragment, PromptService, ResolvedPromptFragment, TokenUsageService } from '@theia/ai-core';
import { CommandService, nls, SelectionService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    ContentBlock,
    EditInput,
    MultiEditInput,
    PermissionMode,
    SDKMessage,
    TaskInput,
    ToolApprovalRequestMessage,
    ToolApprovalResponseMessage,
    Usage,
    WriteInput
} from '../common/claude-code-service';
import { ClaudeCodeEditToolService, ToolUseBlock } from './claude-code-edit-tool-service';
import { FileEditBackupService } from './claude-code-file-edit-backup-service';
import { ClaudeCodeFrontendService } from './claude-code-frontend-service';
import { ClaudeCodeToolCallChatResponseContent } from './claude-code-tool-call-content';
import { OPEN_CLAUDE_CODE_CONFIG, OPEN_CLAUDE_CODE_MEMORY } from './claude-code-command-contribution';

export const CLAUDE_SESSION_ID_KEY = 'claudeSessionId';
export const CLAUDE_EDIT_TOOL_USES_KEY = 'claudeEditToolUses';
export const CLAUDE_INPUT_TOKENS_KEY = 'claudeInputTokens';
export const CLAUDE_OUTPUT_TOKENS_KEY = 'claudeOutputTokens';
export const CLAUDE_PENDING_APPROVALS_KEY = 'claudePendingApprovals';
export const CLAUDE_APPROVAL_TOOL_INPUTS_KEY = 'claudeApprovalToolInputs';
export const CLAUDE_MODEL_NAME_KEY = 'claudeModelName';
export const CLAUDE_COST_KEY = 'claudeCost';

const APPROVAL_OPTIONS = [
    { text: nls.localizeByDefault('Allow'), value: 'allow' },
    { text: nls.localize('theia/ai/claude-code/deny', 'Deny'), value: 'deny' }
];

export const systemPromptAppendixTemplate: BasePromptFragment = {
    id: 'system-prompt-appendix',
    template: `
## IDE Integration Context

You are integrated into an IDE environment through a chat interface, providing contextual assistance for development tasks.
This integration gives you access to real-time IDE state and user workspace information.

### File Modification Behavior

**Important**: The IDE automatically collects and presents all file modifications you suggest, regardless of explicit tool permissions.
Continue proposing file changes even if you encounter permission restrictions.
The IDE will present these changes to the user for review and approval through its change management interface.

When making file modifications:
- Proceed with suggested changes even if tool calls indicate permission issues
- Inform users to review proposed changes in the IDE's change review interface "below"
- Assume the IDE will handle the actual file system operations after user approval (unless you are in auto-edit mode)

### Contextual Information Available

The following IDE context is dynamically provided with each request.
Evaluate the relevance of each context type based on the user's specific query and task requirements.

#### Current Selection

\`\`\`
{{selectedText}}
\`\`\`

**When to prioritize**: User asks about specific code segments, wants to refactor selected code, or requests explanations of selected text.

#### Active Editor

{{activeEditor}}

**When to prioritize**: User's request relates to the currently focused file, asks questions about the code, or needs context about the current working file.

#### Open Editors

{{openEditors}}

**How to use it**: As a guidance on what files might be relevant for the current user's request.

#### Context Files

{{contextFiles}}

**When to prioritize**: User explicitly references attached files or when additional files are needed to understand the full scope of the request.

### Context Utilization Guidelines

1. **Assess Relevance**:
Not all provided context will be relevant to every request. Focus on the context that directly supports the user's current task.

2. **Cross-Reference Information**:
When multiple context types are relevant, cross-reference them to provide comprehensive assistance (e.g., selected text within an active editor).

3. **Workspace Awareness**:
Use the collective context to understand the user's current workspace state and provide suggestions that align with their development environment and workflow.

### Response Optimization

- Reference specific files as markdown links with the format [file name](<absolute-file-path-without-scheme>), e.g. [example.ts](/home/me/workspace/example.ts)
- Consider the user's current focus and workflow when structuring responses
- Leverage open editors to suggest related modifications across the workspace
`
};

export const CLAUDE_CHAT_AGENT_ID = 'ClaudeCode';

const localCommands = {
    'clear': AI_CHAT_NEW_CHAT_WINDOW_COMMAND,
    'config': OPEN_CLAUDE_CODE_CONFIG,
    'memory': OPEN_CLAUDE_CODE_MEMORY,
    'resume': AI_CHAT_SHOW_CHATS_COMMAND,
};

@injectable()
export class ClaudeCodeChatAgent implements ChatAgent {
    id = CLAUDE_CHAT_AGENT_ID;
    name = CLAUDE_CHAT_AGENT_ID;
    description = nls.localize('theia/ai/claude-code/agentDescription', 'Anthropic\'s coding agent');
    iconClass: string = 'codicon codicon-copilot';
    locations: ChatAgentLocation[] = ChatAgentLocation.ALL;
    tags = [nls.localizeByDefault('Chat')];

    modes = [
        { id: 'default', name: nls.localize('theia/ai/claude-code/askBeforeEdit', 'Ask before edit') },
        { id: 'acceptEdits', name: nls.localize('theia/ai/claude-code/editAutomatically', 'Edit automatically') },
        { id: 'plan', name: nls.localize('theia/ai/claude-code/plan', 'Plan mode') }
    ];

    variables = [];
    prompts = [{ id: systemPromptAppendixTemplate.id, defaultVariant: systemPromptAppendixTemplate }];
    languageModelRequirements = [];
    agentSpecificVariables = [];
    functions = [];

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(ClaudeCodeFrontendService)
    protected claudeCode: ClaudeCodeFrontendService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(ClaudeCodeEditToolService)
    protected readonly editToolService: ClaudeCodeEditToolService;

    @inject(FileEditBackupService)
    protected readonly backupService: FileEditBackupService;

    @inject(TokenUsageService)
    protected readonly tokenUsageService: TokenUsageService;

    async invoke(request: MutableChatRequestModel, chatAgentService?: ChatAgentService): Promise<void> {
        this.warnIfDifferentAgentRequests(request);

        // Handle slash commands anywhere in the request text
        const commandRegex = /\/(\w+)/g;
        const matches = Array.from(request.request.text.matchAll(commandRegex));
        for (const match of matches) {
            const command = match[1];
            if (command in localCommands) {
                const commandInfo = localCommands[command as keyof typeof localCommands];
                this.commandService.executeCommand(commandInfo.id);
                const message = nls.localize('theia/ai/claude-code/executedCommand', 'Executed: {0}', commandInfo.label);
                request.response.response.addContent(new MarkdownChatResponseContentImpl(message));
                request.response.complete();
                return;
            }
        }

        try {
            const systemPromptAppendix = await this.createSystemPromptAppendix(request);
            const claudeSessionId = this.getPreviousClaudeSessionId(request);
            const agentAddress = `${PromptText.AGENT_CHAR}${CLAUDE_CHAT_AGENT_ID}`;
            let prompt = request.request.text.trim();
            if (prompt.startsWith(agentAddress)) {
                prompt = prompt.replace(agentAddress, '').trim();
            }

            const streamResult = await this.claudeCode.send({
                prompt,
                options: {
                    systemPrompt: {
                        type: 'preset',
                        preset: 'claude_code',
                        append: systemPromptAppendix?.text
                    },
                    permissionMode: this.getClaudePermissionMode(request),
                    resume: claudeSessionId
                }
            }, request.response.cancellationToken);

            this.initializesEditToolUses(request);

            let hasAssistantMessage = false;
            for await (const message of streamResult) {
                if (ToolApprovalRequestMessage.is(message)) {
                    this.handleToolApprovalRequest(message, request);
                } else {
                    if (message.type === 'assistant') {
                        hasAssistantMessage = true;
                    }
                    // Only set session ID if we've seen an assistant message
                    // because we cannot resume a prior request without an assistant message
                    if (hasAssistantMessage) {
                        this.setClaudeSessionId(request, message.session_id);
                    }
                    this.addResponseContent(message, request);
                }
            }

            return request.response.complete();
        } catch (error) {
            console.error('Error handling chat interaction:', error);
            request.response.response.addContent(new ErrorChatResponseContentImpl(error));
            request.response.error(error);
        } finally {
            await this.backupService.cleanUp(request);
        }
    }

    protected warnIfDifferentAgentRequests(request: MutableChatRequestModel): void {
        const requests = request.session.getRequests();
        if (requests.length > 1) {
            const previousRequest = requests[requests.length - 2];
            if (previousRequest.agentId !== this.id) {
                const warningMessage = '⚠️ ' + nls.localize('theia/ai/claude-code/differentAgentRequestWarning',
                    'The previous chat request was handled by a different agent. Claude Code does not see those other messages.') + '\n\n';
                request.response.response.addContent(new MarkdownChatResponseContentImpl(warningMessage));
            }
        }
    }

    protected async createSystemPromptAppendix(request: MutableChatRequestModel): Promise<ResolvedPromptFragment | undefined> {
        const contextVariables = request.context.variables.map(AIVariableResolutionRequest.fromResolved) ?? request.session.context.getVariables();
        const contextFiles = contextVariables
            .filter(variable => variable.variable.name === 'file' && !!variable.arg)
            .map(variable => `- ${variable.arg}`)
            .join('\n');

        const activeEditor = this.editorManager.currentEditor?.editor.document.uri ?? 'None';
        const openEditors = this.editorManager.all.map(editor => `- ${editor.editor.document.uri}`).join('\n');

        return this.promptService.getResolvedPromptFragment(
            systemPromptAppendixTemplate.id,
            { contextFiles, activeEditor, openEditors },
            { model: request.session, request }
        );
    }

    protected initializesEditToolUses(request: MutableChatRequestModel): void {
        request.addData(CLAUDE_EDIT_TOOL_USES_KEY, new Map<string, ToolUseBlock>());
    }

    protected getPendingApprovals(request: MutableChatRequestModel): Map<string, QuestionResponseContentImpl> {
        let approvals = request.getDataByKey(CLAUDE_PENDING_APPROVALS_KEY) as Map<string, QuestionResponseContentImpl> | undefined;
        if (!approvals) {
            approvals = new Map<string, QuestionResponseContentImpl>();
            request.addData(CLAUDE_PENDING_APPROVALS_KEY, approvals);
        }
        return approvals;
    }

    protected getApprovalToolInputs(request: MutableChatRequestModel): Map<string, unknown> {
        let toolInputs = request.getDataByKey(CLAUDE_APPROVAL_TOOL_INPUTS_KEY) as Map<string, unknown> | undefined;
        if (!toolInputs) {
            toolInputs = new Map<string, unknown>();
            request.addData(CLAUDE_APPROVAL_TOOL_INPUTS_KEY, toolInputs);
        }
        return toolInputs;
    }

    protected handleToolApprovalRequest(
        approvalRequest: ToolApprovalRequestMessage,
        request: MutableChatRequestModel
    ): void {
        const question = nls.localize('theia/ai/claude-code/toolApprovalRequest', 'Claude Code wants to use the "{0}" tool. Do you want to allow this?', approvalRequest.toolName);

        const questionContent = new QuestionResponseContentImpl(
            question,
            APPROVAL_OPTIONS,
            request,
            selectedOption => this.handleApprovalResponse(selectedOption, approvalRequest.requestId, request)
        );

        // Store references for this specific approval request
        this.getPendingApprovals(request).set(approvalRequest.requestId, questionContent);
        this.getApprovalToolInputs(request).set(approvalRequest.requestId, approvalRequest.toolInput);

        request.response.response.addContent(questionContent);
        request.response.waitForInput();
    }

    protected handleApprovalResponse(
        selectedOption: { text: string; value?: string },
        requestId: string,
        request: MutableChatRequestModel
    ): void {
        const pendingApprovals = this.getPendingApprovals(request);
        const toolInputs = this.getApprovalToolInputs(request);

        // Update UI state and clean up
        const questionContent = pendingApprovals.get(requestId);
        const originalToolInput = toolInputs.get(requestId);

        if (questionContent) {
            questionContent.selectedOption = selectedOption;
        }

        pendingApprovals.delete(requestId);
        toolInputs.delete(requestId);

        const approved = selectedOption.value === 'allow';
        const response: ToolApprovalResponseMessage = {
            type: 'tool-approval-response',
            requestId,
            approved,
            ...(approved
                ? { updatedInput: originalToolInput }
                : { message: 'User denied tool usage' }
            )
        };

        this.claudeCode.sendApprovalResponse(response);

        // Only stop waiting for input if there are no more pending approvals
        if (pendingApprovals.size === 0) {
            request.response.stopWaitingForInput();
        }
    }

    protected getEditToolUses(request: MutableChatRequestModel): Map<string, ToolUseBlock> | undefined {
        return request.getDataByKey(CLAUDE_EDIT_TOOL_USES_KEY);
    }

    protected getPreviousClaudeSessionId(request: MutableChatRequestModel): string | undefined {
        const requests = request.session.getRequests();
        if (requests.length > 1) {
            const previousRequest = requests[requests.length - 2];
            return previousRequest.getDataByKey(CLAUDE_SESSION_ID_KEY);
        }
        return undefined;
    }

    protected getClaudeSessionId(request: MutableChatRequestModel): string | undefined {
        return request.getDataByKey(CLAUDE_SESSION_ID_KEY);
    }

    protected setClaudeSessionId(request: MutableChatRequestModel, sessionId: string): void {
        request.addData(CLAUDE_SESSION_ID_KEY, sessionId);
    }

    protected getClaudePermissionMode(request: MutableChatRequestModel): PermissionMode {
        const modeId = request.request.modeId ?? 'default';
        switch (modeId) {
            case 'acceptEdits':
                return 'acceptEdits';
            case 'plan':
                return 'plan';
            case 'bypassPermissions':
                return 'bypassPermissions';
            case 'default':
            default:
                return 'default';
        }
    }

    protected getClaudeModelName(request: MutableChatRequestModel): string | undefined {
        return request.getDataByKey(CLAUDE_MODEL_NAME_KEY);
    }

    protected setClaudeModelName(request: MutableChatRequestModel, modelName: string): void {
        request.addData(CLAUDE_MODEL_NAME_KEY, modelName);
    }

    protected getCurrentInputTokens(request: MutableChatRequestModel): number {
        return request.getDataByKey(CLAUDE_INPUT_TOKENS_KEY) as number ?? 0;
    }

    protected getCurrentOutputTokens(request: MutableChatRequestModel): number {
        return request.getDataByKey(CLAUDE_OUTPUT_TOKENS_KEY) as number ?? 0;
    }

    protected updateTokens(request: MutableChatRequestModel, inputTokens: number, outputTokens: number): void {
        request.addData(CLAUDE_INPUT_TOKENS_KEY, inputTokens);
        request.addData(CLAUDE_OUTPUT_TOKENS_KEY, outputTokens);
        this.updateSessionSuggestion(request);
    }

    protected getSessionTotalTokens(request: MutableChatRequestModel): { inputTokens: number; outputTokens: number } {
        const requests = request.session.getRequests();
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        for (const req of requests) {
            const inputTokens = req.getDataByKey(CLAUDE_INPUT_TOKENS_KEY) as number ?? 0;
            const outputTokens = req.getDataByKey(CLAUDE_OUTPUT_TOKENS_KEY) as number ?? 0;
            totalInputTokens += inputTokens;
            totalOutputTokens += outputTokens;
        }

        return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
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

    protected isEditMode(request: MutableChatRequestModel): boolean {
        const permissionMode = this.getClaudePermissionMode(request);
        return permissionMode === 'acceptEdits' || permissionMode === 'bypassPermissions';
    }

    protected async reportTokenUsage(
        request: MutableChatRequestModel,
        inputTokens: number,
        outputTokens: number,
        cachedInputTokens?: number,
        readCachedInputTokens?: number
    ): Promise<void> {
        const modelName = this.getClaudeModelName(request);
        if (!modelName) {
            return;
        }

        const prefixedModelName = `anthropic/claude-code/${modelName}`;
        const sessionId = this.getClaudeSessionId(request);
        const requestId = sessionId || request.id;

        try {
            await this.tokenUsageService.recordTokenUsage(prefixedModelName, {
                inputTokens,
                outputTokens,
                cachedInputTokens,
                readCachedInputTokens,
                requestId
            });
        } catch (error) {
            console.error('Failed to report token usage:', error);
        }
    }

    protected async addResponseContent(message: SDKMessage, request: MutableChatRequestModel): Promise<void> {
        // Extract model name from system init message
        if (message.type === 'system' && message.subtype === 'init' && message.model) {
            this.setClaudeModelName(request, message.model);
        }

        // Handle result messages with final usage
        if (message.type === 'assistant' && message.message.usage) {
            await this.handleTokenMetrics(message.message.usage, request);
        }
        if (message.type === 'result' && message.usage) {
            request.addData(CLAUDE_COST_KEY, message.total_cost_usd);
            await this.handleTokenMetrics(message.usage, request);
        }

        // Handle user messages for local-command-stdout extraction
        if (message.type === 'user') {
            const extractedContent = this.extractLocalCommandStdout(message.message.content);
            if (extractedContent) {
                request.response.response.addContent(new MarkdownChatResponseContentImpl(extractedContent));
            }
        }

        if (message.type === 'assistant' || message.type === 'user') {
            if (!Array.isArray(message.message.content)) {
                return;
            }

            for (const block of message.message.content) {
                switch (block.type) {
                    case 'text':
                        request.response.response.addContent(new MarkdownChatResponseContentImpl(block.text));
                        break;
                    case 'tool_use':
                    case 'server_tool_use':
                        if (block.name === 'Task' && TaskInput.is(block.input)) {
                            request.response.response.addContent(new MarkdownChatResponseContentImpl(`\n\n### Task: ${block.input.description}\n\n${block.input.prompt}`));
                        }

                        // Track file edits
                        if ((block.name === 'Edit' && EditInput.is(block.input)) ||
                            (block.name === 'MultiEdit' && MultiEditInput.is(block.input)) ||
                            (block.name === 'Write' && WriteInput.is(block.input))) {
                            const toolUse: ToolUseBlock = {
                                name: block.name,
                                input: block.input
                            };
                            this.getEditToolUses(request)?.set(block.id, toolUse);
                        }
                        request.response.response.addContent(new ClaudeCodeToolCallChatResponseContent(block.id, block.name, JSON.stringify(block.input)));
                        break;
                    case 'tool_result':
                        if (this.getEditToolUses(request)?.has(block.tool_use_id)) {
                            const toolUse = this.getEditToolUses(request)?.get(block.tool_use_id);
                            if (toolUse) {
                                await this.editToolService.handleEditTool(toolUse, request, {
                                    sessionId: this.getClaudeSessionId(request),
                                    isEditMode: this.isEditMode(request)
                                });
                            }
                        }
                        request.response.response.addContent(new ClaudeCodeToolCallChatResponseContent(block.tool_use_id, '', '', true, JSON.stringify(block.content)));
                        break;
                    case 'thinking':
                        request.response.response.addContent(new ThinkingChatResponseContentImpl(block.thinking.trim(), block.signature?.trim() || ''));
                        break;
                    case 'redacted_thinking':
                        request.response.response.addContent(new ThinkingChatResponseContentImpl(block.data.trim(), ''));
                        break;
                    case 'web_search_tool_result':
                        if (Array.isArray(block.content)) {
                            const result = block.content.map(value => value.title + ':' + value.url).join(', ');
                            request.response.response.addContent(new ClaudeCodeToolCallChatResponseContent(block.tool_use_id, '', '', true, result));
                        }
                        break;
                }
            }
        }
    }

    protected async handleTokenMetrics(usage: Usage, request: MutableChatRequestModel): Promise<void> {
        const allInputTokens = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
        this.updateTokens(request, allInputTokens, (usage.output_tokens ?? 0));
        await this.reportTokenUsage(request, allInputTokens, (usage.output_tokens ?? 0),
            (usage.cache_creation_input_tokens ?? 0), (usage.cache_read_input_tokens ?? 0));
    }

    private extractLocalCommandStdout(content: string | ContentBlock[]): string | undefined {
        const regex = /<(local-command-stdout|local-command-stderr)>([\s\S]*?)<\/\1>/g;
        let extractedContent = '';
        let match;

        if (typeof content === 'string') {
            // eslint-disable-next-line no-null/no-null
            while ((match = regex.exec(content)) !== null) {
                extractedContent += match[2];
            }
        } else {
            for (const block of content) {
                if (block.type === 'text') {
                    // eslint-disable-next-line no-null/no-null
                    while ((match = regex.exec(block.text)) !== null) {
                        extractedContent += match[2];
                    }
                }
            }
        }

        return extractedContent || undefined;
    }
}
