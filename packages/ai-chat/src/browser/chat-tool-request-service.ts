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

import { ToolInvocationContext, ToolRequest, ToolCallResult, formatToolCallContentForModel } from '@theia/ai-core';
import { ILogger, URI, generateUuid } from '@theia/core';
import { PreferenceService } from '@theia/core/lib/common';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import {
    ChatToolRequestService,
    LoopContinueDecision,
    normalizeToolArgs,
    ToolLoopGuardConfig
} from '../common/chat-tool-request-service.js';
import { raceConfirmationWithTimeout } from '../common/chat-tool-confirmation-timeout.js';
import { MutableChatRequestModel, ToolCallChatResponseContent, ToolCallChatResponseContentImpl } from '../common/chat-model.js';
import { ToolConfirmationMode, ChatToolPreferences, TOOL_CONFIRMATION_TIMEOUT_PREFERENCE } from '../common/chat-tool-preferences.js';
import {
    TOOL_LOOP_GUARD_ENABLED_PREF,
    TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF,
    TOOL_LOOP_GUARD_PROMPT_THRESHOLD_PREF,
    TOOL_LOOP_GUARD_FAIL_THRESHOLD_PREF
} from '../common/ai-chat-preferences.js';
import { ToolConfirmationManager } from './chat-tool-preference-bindings.js';

/**
 * Synthetic tool id the loop-guard "continue?" prompt reuses to remember the user's decision through
 * the existing {@link ToolConfirmationManager} machinery: ALWAYS_ALLOW means "keep going", DISABLED means
 * "stop". It is not a real tool, so it never appears in the tool registry or the tools configuration view.
 */
export const LOOP_GUARD_CONTINUE_TOOL_ID = '__loopGuardContinue__';

/**
 * Frontend-specific implementation of ChatToolRequestService that handles tool confirmation
 */
@injectable()
export class FrontendChatToolRequestService extends ChatToolRequestService {

    @inject(ILogger) @named('ai-chat:FrontendChatToolRequestService')
    protected readonly logger: ILogger;

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(ChatToolPreferences)
    protected readonly preferences: ChatToolPreferences;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    /**
     * Resolves a workspace-relative `<rootName>/<relativePath>` tool `path` argument (the format the file tools
     * emit via {@link WorkspaceService.getRootPrefixedPath}) to the URI the {@link FileReadTracker} tracks, so a
     * refresh can target the right file. Absolute / `file://` forms are handled by the common base; anything that
     * does not resolve returns `undefined`, falling back to a whole-session refresh.
     */
    protected override async resolveRefreshUri(request: MutableChatRequestModel, path: string): Promise<URI | undefined> {
        const absolute = await super.resolveRefreshUri(request, path);
        if (absolute) {
            return absolute;
        }
        return this.workspaceService.resolveRootPrefixedPath(path);
    }

    protected override getLoopGuardConfig(_request: MutableChatRequestModel): ToolLoopGuardConfig {
        const enabled = this.preferenceService.get<boolean>(TOOL_LOOP_GUARD_ENABLED_PREF, true);
        const refreshThreshold = Math.max(1, this.preferenceService.get<number>(TOOL_LOOP_GUARD_REFRESH_THRESHOLD_PREF, 3));
        const rawPromptThreshold = this.preferenceService.get<number>(TOOL_LOOP_GUARD_PROMPT_THRESHOLD_PREF, 4);
        const rawFailThreshold = this.preferenceService.get<number>(TOOL_LOOP_GUARD_FAIL_THRESHOLD_PREF, 5);

        // A prompt threshold of 0 disables the prompt. Otherwise the three stages must run on distinct attempts
        // (refresh < prompt < fail): the refresh and fail branches both return early, so a prompt sharing an
        // attempt with either would never be reached (e.g. refresh=4 collapsing prompt to 4 and fail to 5 leaves
        // no attempt for the prompt). We therefore give the prompt its own attempt above the refresh and reserve
        // a further attempt above it for the failure.
        const promptEnabled = rawPromptThreshold > 0;
        const promptThreshold = promptEnabled
            ? Math.max(refreshThreshold + 1, rawPromptThreshold)
            : 0;
        // The fail threshold must stay above whichever earlier stage is active, so each gets its own attempt.
        const minFailThreshold = promptEnabled ? promptThreshold + 1 : refreshThreshold + 1;
        const failThreshold = Math.max(minFailThreshold, rawFailThreshold);
        return { enabled, refreshThreshold, promptThreshold, failThreshold };
    }

    /**
     * Asks the user, through the chat UI, whether the agent should keep retrying a looping tool call. The
     * prompt reuses the existing tool-confirmation UI (Allow = continue, Deny = stop) and its
     * remember-my-decision scopes: choosing "this session" or "always" stores the answer against the synthetic
     * {@link LOOP_GUARD_CONTINUE_TOOL_ID} via the {@link ToolConfirmationManager}, so the user is not asked
     * again for the rest of the session (or ever, if persisted). A plain choice applies only to this prompt.
     *
     * If the user has already remembered a decision, it is honored without showing the prompt again. If the
     * confirmation times out, the loop is stopped (the safe default, so an unattended session does not keep
     * burning cycles on a loop it cannot break).
     */
    protected override async promptContinueOnLoop(
        request: MutableChatRequestModel,
        toolRequest: ToolRequest,
        count: number,
        result: ToolCallResult
    ): Promise<LoopContinueDecision> {
        const chatId = request.session.rootSessionId ?? request.session.id;

        // Honor a previously remembered decision (session override or persisted) without asking again.
        const remembered = this.confirmationManager.getConfirmationMode(LOOP_GUARD_CONTINUE_TOOL_ID, chatId);
        if (remembered === ToolConfirmationMode.ALWAYS_ALLOW) {
            return 'continue';
        }
        if (remembered === ToolConfirmationMode.DISABLED) {
            return 'stop';
        }

        const toolName = toolRequest.name ?? toolRequest.id;
        const promptContent = new ToolCallChatResponseContentImpl(
            // Use a fresh id per prompt: reusing `request.id`/`count` would collide when a successful call
            // resets the counter and a later run in the same request reaches the same count again. `addContent`
            // merges same-id content into the existing response object, so the second prompt would be awaited on
            // a new object while the UI still references the old one, leaving it unanswerable.
            `loop-guard-continue-${generateUuid()}`,
            LOOP_GUARD_CONTINUE_TOOL_ID,
            JSON.stringify({
                tool: toolName,
                repeatedErrors: count,
                lastError: formatToolCallContentForModel(result)
            }),
            false
        );

        request.response.response.addContent(promptContent);

        const sessionTimeout = request.session.settings?.commonSettings?.confirmationTimeout;
        const timeoutSeconds = sessionTimeout !== undefined && sessionTimeout > 0
            ? sessionTimeout
            : this.preferences[TOOL_CONFIRMATION_TIMEOUT_PREFERENCE];
        promptContent.confirmationTimeout = timeoutSeconds;
        promptContent.requestUserConfirmation();
        request.response.fireInteractionNeeded(promptContent);
        request.response.waitForInput();

        let confirmed: boolean;
        try {
            // confirm() (Allow) => continue; deny() (Deny) or timeout => stop.
            confirmed = await raceConfirmationWithTimeout(promptContent, timeoutSeconds);
        } finally {
            request.response.stopWaitingForInput();
        }

        // Mark the prompt finished so the UI stops showing it as pending.
        if (!promptContent.finished) {
            promptContent.complete({ content: [{ type: 'text', text: confirmed ? 'continue' : 'stop' }] });
        }

        return confirmed ? 'continue' : 'stop';
    }

    protected override toChatToolRequest(toolRequest: ToolRequest, request: MutableChatRequestModel): ToolRequest {
        return {
            ...toolRequest,
            handler: async (arg_string: string, ctx?: ToolInvocationContext) => {
                const toolCallId = ctx?.toolCallId;
                const sessionId = request.session.rootSessionId ?? request.session.id;
                const confirmationMode = this.confirmationManager.getConfirmationMode(toolRequest.id, sessionId, toolRequest);

                switch (confirmationMode) {
                    case ToolConfirmationMode.DISABLED:
                        return { denied: true, message: `Tool ${toolRequest.id} is disabled` };

                    case ToolConfirmationMode.ALWAYS_ALLOW: {
                        const toolCallContentAlwaysAllow = this.findToolCallContent(toolRequest, arg_string, request, toolCallId);
                        toolCallContentAlwaysAllow.confirm();
                        const result = await this.invokeWithLoopGuard(toolRequest, arg_string, request,
                            () => toolRequest.handler(arg_string, this.createToolContext(request, ToolInvocationContext.create(toolCallContentAlwaysAllow.id))));
                        // Signal completion for immediate UI update. The language model uses Promise.all
                        // for parallel tools, so without this the UI wouldn't update until all tools finish.
                        // The result will be overwritten with the same value when the LLM stream yields it.
                        toolCallContentAlwaysAllow.complete(result);
                        return result;
                    }

                    case ToolConfirmationMode.CONFIRM:
                    default: {
                        const toolCallContent = this.findToolCallContent(toolRequest, arg_string, request, toolCallId);

                        // Check for auto-action hook
                        const autoAction = toolRequest.checkAutoAction?.(arg_string);

                        let confirmed: boolean;
                        if (autoAction?.action === 'allow') {
                            toolCallContent.confirm();
                            confirmed = await toolCallContent.confirmed;
                        } else if (autoAction?.action === 'deny') {
                            toolCallContent.deny(autoAction.reason);
                            return toolCallContent.result;
                        } else {
                            // No auto-action — needs user confirmation
                            // Session setting overrides global preference
                            const sessionTimeout = request.session.settings?.commonSettings?.confirmationTimeout;
                            const timeoutSeconds = sessionTimeout !== undefined && sessionTimeout > 0
                                ? sessionTimeout
                                : this.preferences[TOOL_CONFIRMATION_TIMEOUT_PREFERENCE];
                            toolCallContent.confirmationTimeout = timeoutSeconds;
                            const confirmation = raceConfirmationWithTimeout(toolCallContent, timeoutSeconds);
                            toolCallContent.requestUserConfirmation();
                            request.response.fireInteractionNeeded(toolCallContent);
                            // Mark the response as waiting for input so the pending confirmation is
                            // surfaced consistently with agent questions (e.g. in the session overview).
                            request.response.waitForInput();
                            try {
                                confirmed = await confirmation;
                            } finally {
                                request.response.stopWaitingForInput();
                            }
                        }

                        if (confirmed) {
                            const result = await this.invokeWithLoopGuard(toolRequest, arg_string, request,
                                () => toolRequest.handler(arg_string, this.createToolContext(request, ToolInvocationContext.create(toolCallContent.id))));
                            // Signal completion for immediate UI update (see ALWAYS_ALLOW case for details)
                            toolCallContent.complete(result);
                            return result;
                        } else {
                            return toolCallContent.result;
                        }
                    }
                }
            }
        };
    }

    /**
     * Finds the matching ToolCallChatResponseContent for a tool invocation.
     *
     * Matches by: 1) toolCallId, 2) tool name + normalized arguments, 3) fallback by name only.
     */
    protected findToolCallContent(
        toolRequest: ToolRequest,
        arguments_: string,
        request: MutableChatRequestModel,
        toolCallId?: string
    ): ToolCallChatResponseContent {
        const response = request.response.response;
        const contentArray = response.content;

        // Match on toolCallId first if LLM made it available
        if (toolCallId !== undefined) {
            for (let i = contentArray.length - 1; i >= 0; i--) {
                const content = contentArray[i];
                if (ToolCallChatResponseContent.is(content) && content.id === toolCallId) {
                    return content;
                }
            }
        }

        // Normalize arguments for comparison to handle differences in empty argument representation
        const normalizedArguments = normalizeToolArgs(arguments_);

        // Fall back to matching on tool name and normalized arguments
        for (let i = contentArray.length - 1; i >= 0; i--) {
            const content = contentArray[i];
            if (ToolCallChatResponseContent.is(content) &&
                content.name === toolRequest.id &&
                normalizeToolArgs(content.arguments) === normalizedArguments) {
                return content;
            }
        }

        // Fallback: match on tool name only
        for (let i = contentArray.length - 1; i >= 0; i--) {
            const content = contentArray[i];
            if (ToolCallChatResponseContent.is(content) &&
                content.name === toolRequest.id &&
                !content.finished) {
                this.logger.warn(`Tool call content for tool ${toolRequest.id} matched by incomplete status fallback. ` +
                    `Expected toolCallId: ${toolCallId}, arguments: ${arguments_}`);
                return content;
            }
        }

        throw new Error(`Tool call content for tool ${toolRequest.id} not found in the response`);
    }
}
